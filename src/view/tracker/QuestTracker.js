import QuestAPI         from '../../control/public/QuestAPI.js';
import QuestDB          from '../../control/QuestDB.js';
import SidebarManager   from '../../control/SidebarManager.js';
import Socket           from '../../control/Socket.js';
import Utils            from '../../control/Utils.js';
import FQLContextMenu   from '../FQLContextMenu.js';
import collect          from '../../../external/collect.js';

import { constants, jquery, questStatus, sessionConstants, settings } from '../../model/constants.js';

/**
 * Provides the default width for the QuestTracker if not defined.
 *
 * @type {number}
 */
const s_DEFAULT_WIDTH = 296;

/**
 * Provides the default position for the QuestTracker if not defined.
 *
 * @type {{top: number, width: number}}
 */
const s_DEFAULT_POSITION = { top: 80, width: s_DEFAULT_WIDTH };

/**
 * Provides the quest tracker which provides an overview of active quests and objectives which can be opened / closed
 * to show all objectives for a given quest. The folder / open state is stored in {@link sessionStorage}.
 *
 * In the {@link QuestTracker.getData} method {@link QuestTracker.prepareQuests} is invoked which gets all sorted
 * {@link questStatus.active} via {@link QuestDB.sortCollect}. They are then mapped creating the specific data which is
 * used in the {@link Handlebars} template. In the future this may be cached in a similar way that {@link Quest} data
 * is cached for {@link QuestLog}.
 */
export default class QuestTracker extends Application
{
   /**
    * @inheritDoc
    * @see https://foundryvtt.com/api/Application.html
    */
   constructor(options = {})
   {
      super(options);

      /**
       * @type {object}
       */
      try
      {
         /**
          * Stores the current position of the quest tracker.
          *
          * @type {object}
          * {@link Application.position}
          */
         this.position = JSON.parse(game.settings.get(constants.moduleName, settings.questTrackerPosition));

         // When upgrading to `v0.7.7` it is necessary to set the default width.
         if (!this.position?.width) { this.position.width = s_DEFAULT_WIDTH; }
      }
      catch (err)
      {
         this.position = s_DEFAULT_POSITION;
      }

      /**
       * Stores whether the QuestTracker is pinned to the sidebar.
       *
       * @type {boolean}
       * @private
       */
      this._pinned = false;
   }

   /**
    * Default {@link Application} options
    *
    * @returns {object} options - Application options.
    * @see https://foundryvtt.com/api/Application.html#options
    */
   static get defaultOptions()
   {
      return foundry.utils.mergeObject(super.defaultOptions, {
         id: 'quest-tracker',
         template: 'modules/forien-quest-log/templates/quest-tracker.html',
         minimizable: false,
         resizable: true,
         popOut: false,
         width: 300,
         height: 480,
         title: game.i18n.localize('ForienQuestLog.QuestTracker.Title')
      });
   }

   /**
    * Create the context menu. There are two separate context menus for the active / in progress tab and all other tabs.
    *
    * @param {JQuery}   html - JQuery element for this application.
    *
    * @private
    */
   _contextMenu(html)
   {
      const menuItemCopyLink = {
         name: 'ForienQuestLog.QuestLog.ContextMenu.CopyEntityLink',
         icon: '<i class="fas fa-link"></i>',
         callback: (menu) =>
         {
            const questId = $(menu)?.closest('.quest-tracker-header')?.data('quest-id');
            const quest = QuestDB.getQuest(questId);

            if (quest && Utils.copyTextToClipboard(`@Quest[${quest.id}]{${quest.name}}`))
            {
               ui.notifications.info(game.i18n.format('ForienQuestLog.Notifications.LinkCopied'));
            }
         }
      };

      /**
       * @type {object[]}
       */
      const menuItems = [menuItemCopyLink];

      if (game.user.isGM)
      {
         menuItems.push({
            name: 'ForienQuestLog.QuestLog.ContextMenu.PrimaryQuest',
            icon: '<i class="fas fa-star pad-l-0"></i>',
            callback: (menu) =>
            {
               const questId = $(menu)?.closest('.quest-tracker-header')?.data('quest-id');
               const quest = QuestDB.getQuest(questId);
               if (quest) { Socket.setQuestPrimary({ quest }); }
            }
         });
      }

      new FQLContextMenu(html, '.quest-tracker-header', menuItems);
   }

   /**
    * Specify the set of config buttons which should appear in the Application header. Buttons should be returned as an
    * Array of objects.
    *
    * Provides an explicit override of Application._getHeaderButtons to add
    *
    * @returns {ApplicationHeaderButton[]} The app header buttons.
    * @override
    */
   _getHeaderButtons()
   {
      const buttons = super._getHeaderButtons();

      const primaryState = sessionStorage.getItem(sessionConstants.trackerShowPrimary) === 'true';
      const primaryIcon = primaryState ? 'fas fa-star' : 'far fa-star';
      const primaryTitle = primaryState ? 'ForienQuestLog.QuestTracker.Tooltips.PrimaryQuestUnshow' :
       'ForienQuestLog.QuestTracker.Tooltips.PrimaryQuestShow';

      buttons.unshift({
         title: primaryTitle,
         class: 'show-primary',
         icon: primaryIcon
      });

      return buttons;
   }

   /**
    *
    * @returns {boolean}
    */
   get pinned() { return this._pinned; }

   /**
    * Defines all {@link JQuery} control callbacks with event listeners for click, drag, drop via various CSS selectors.
    *
    * @param {JQuery}  html - The jQuery instance for the window content of this Application.
    *
    * @see https://foundryvtt.com/api/FormApplication.html#activateListeners
    */
   activateListeners(html)
   {
      super.activateListeners(html);

      // Make the window draggable
      const header = html.find('header')[0];
      new Draggable(this, html, header, this.options.resizable);

      html.on(jquery.click, '.header-button.close', void 0, this.close);

      html.on(jquery.click, '.header-button.show-primary i', void 0, () =>
      {
         const newPrimary = !(sessionStorage.getItem(sessionConstants.trackerShowPrimary) === 'true');
         sessionStorage.setItem(sessionConstants.trackerShowPrimary, (newPrimary).toString());

         const showPrimaryIcon = $('#quest-tracker .header-button.show-primary i');
         showPrimaryIcon.attr('class', newPrimary ? 'fas fa-star' : 'far fa-star');
         showPrimaryIcon.attr('title', game.i18n.localize(newPrimary ?
          'ForienQuestLog.QuestTracker.Tooltips.PrimaryQuestShow' :
           'ForienQuestLog.QuestTracker.Tooltips.PrimaryQuestUnshow'));

         this.render();
      });

      // Add context menu.
      this._contextMenu(html);

      Utils.createJQueryDblClick({
         selector: '#quest-tracker .quest-tracker-header',
         singleCallback: this._handleQuestClick.bind(this),
         doubleCallback: this._handleQuestOpen,
      });

      html.on(jquery.click, '.quest-tracker-link', void 0, this._handleQuestOpen);

      html.on(jquery.click, '.quest-tracker-task', void 0, this._handleQuestTask.bind(this));

      /**
       * @type {JQuery} The QuestTracker app element.
       *
       * @private
       */
      this._elemQuestTracker = $('#quest-tracker.fql-app');

      /**
       * @type {JQuery} The window header element.
       *
       * @private
       */
      this._elemWindowHeader = $('#quest-tracker .fql-window-header');

      /**
       * @type {JQuery} The window content element.
       *
       * @private
       */
      this._elemWindowContent = $('#quest-tracker .fql-window-content');

      /**
       * @type {JQuery} The window resize handle.
       *
       * @private
       */
      this._elemResizeHandle = $('#quest-tracker .window-resizable-handle');

      /**
       * Stores the app / window extents from styles.
       *
       * @type {{minHeight: number, maxHeight: number, minWidth: number, maxWidth: number}}
       *
       * @private
       */
      this._appExtents = {
         minWidth: parseInt(this._elemQuestTracker.css('min-width')),
         maxWidth: parseInt(this._elemQuestTracker.css('max-width')),
         minHeight: parseInt(this._elemQuestTracker.css('min-height')),
         maxHeight: parseInt(this._elemQuestTracker.css('max-height'))
      };

      /**
       * Stores the state of {@link FQLSettings.questTrackerResizable}.
       *
       * @type {boolean}
       * @private
       */
      this._windowResizable = game.settings.get(constants.moduleName, settings.questTrackerResizable);

      if (this._windowResizable)
      {
         this._elemResizeHandle.show();
         this._elemQuestTracker.css('min-height', this._appExtents.minHeight);
      }
      else
      {
         this._elemResizeHandle.hide();
         this._elemQuestTracker.css('min-height', this._elemWindowHeader[0].scrollHeight);

         // A bit of a hack. We need to call the Application setPosition now to make sure the element parameters
         // are correctly set as the exact height for the element is calculated in this.setPosition which is called
         // by Application right after this method completes.
         // Must set popOut temporarily to true as there is a gate in `Application.setPosition`.
         this.options.popOut = true;
         super.setPosition(this.position);
         this.options.popOut = false;
      }

      /**
       * Stores whether the scroll bar is active.
       *
       * @type {boolean}
       *
       * @private
       */
      this._scrollbarActive = this._elemWindowContent[0].scrollHeight > this._elemWindowContent[0].clientHeight;

      // Set current scrollbar active state and potentially set 'point-events' to 'auto'.
      if (this._scrollbarActive) { this._elemQuestTracker.css('pointer-events', 'auto'); }
   }

   /**
    * Override default Application `bringToTop` to stop adjustment of z-index.
    *
    * @override
    * @inheritDoc
    * @see https://foundryvtt.com/api/Application.html#bringToTop
    */
   bringToTop() {}

   /**
    * Sets `questTrackerEnable` to false.
    *
    * @param {object}   [options] - Optional parameters.
    *
    * @param {boolean}  [options.updateSetting=true] - If true then {@link settings.questTrackerEnable} is set to false.
    *
    * @returns {Promise<void>}
    */
   async close({ updateSetting = true } = {})
   {
      await super.close();

      if (updateSetting)
      {
         await game.settings.set(constants.moduleName, settings.questTrackerEnable, false);
      }
   }

   /**
    * Parses quest data in {@link QuestTracker.prepareQuests}.
    *
    * @override
    * @inheritDoc
    * @see https://foundryvtt.com/api/FormApplication.html#getData
    */
   async getData(options = {})
   {
      const showOnlyPrimary = sessionStorage.getItem(sessionConstants.trackerShowPrimary) === 'true';
      const primaryQuest = QuestDB.getQuestEntry(game.settings.get(constants.moduleName, settings.primaryQuest));

      // Stores the primary quest ID when all in progress quests are shown so that the star icon is drawn for the
      // primary quest.
      const primaryQuestId = !showOnlyPrimary && primaryQuest ? primaryQuest.id : '';

      const quests = await this.prepareQuests(showOnlyPrimary, primaryQuest);

      return foundry.utils.mergeObject(super.getData(options), {
         title: this.options.title,
         headerButtons: this._getHeaderButtons(),
         hasQuests: quests.count() > 0,
         primaryQuestId,
         quests
      });
   }

   /**
    * Data for the quest folder open / close state is saved in {@link sessionStorage}.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   _handleQuestClick(event)
   {
      const questId = event.currentTarget.dataset.questId;

      const questEntry = QuestDB.getQuestEntry(questId);
      if (questEntry && questEntry.enrich.hasObjectives)
      {
         const folderState = sessionStorage.getItem(`${sessionConstants.trackerFolderState}${questId}`);
         const collapsed = folderState !== 'false';
         sessionStorage.setItem(`${sessionConstants.trackerFolderState}${questId}`, (!collapsed).toString());

         this.render();
      }
   }

   /**
    * Handles the quest open click via {@link QuestAPI.open}.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   _handleQuestOpen(event)
   {
      const questId = event.currentTarget.dataset.questId;
      QuestAPI.open({ questId });
   }

   /**
    * Handles toggling {@link Quest} tasks when clicked on by a user that is the GM or owner of quest.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   async _handleQuestTask(event)
   {
      // Don't handle any clicks of internal anchor elements such as entity content links.
      if ($(event.target).is('.quest-tracker-task a')) { return; }

      const questId = event.currentTarget.dataset.questId;
      const uuidv4 = event.currentTarget.dataset.uuidv4;

      const quest = QuestDB.getQuest(questId);

      if (quest)
      {
         const task = quest.getTask(uuidv4);
         if (task)
         {
            task.toggle();
            await quest.save();

            Socket.refreshQuestPreview({
               questId,
               focus: false
            });
         }
      }
   }

   /**
    * Transforms the quest data from sorted active quests. In this case we need to determine which quests can be
    * manipulated for trusted player edit.
    *
    * @param {boolean}           showOnlyPrimary - Shows only the primary quest.
    *
    * @param {QuestEntry|void}   primaryQuest - Any currently set primary quest.
    *
    * @returns {Promise<Collection<object>>} Sorted active quests.
    */
   async prepareQuests(showOnlyPrimary, primaryQuest)
   {
      /**
       * If showOnlyPrimary and the primaryQuest exists then build a Collection with just the primary quest otherwise
       * get all sorted in progress quests from the QuestDB.
       *
       * @type {Collection}
       */
      const questEntries = showOnlyPrimary ? collect(primaryQuest ? [primaryQuest] : []) :
       QuestDB.sortCollect({ status: questStatus.active });

      const isGM = game.user.isGM;
      const isTrustedPlayerEdit = Utils.isTrustedPlayerEdit();

      return questEntries.transform((entry) =>
      {
         const q = entry.enrich;
         const collapsed = sessionStorage.getItem(`${sessionConstants.trackerFolderState}${q.id}`) === 'false';

         const tasks = collapsed ? q.data_tasks : [];
         const subquests = collapsed ? q.data_subquest : [];

         return {
            id: q.id,
            canEdit: isGM || (entry.isOwner && isTrustedPlayerEdit),
            playerEdit: entry.isOwner,
            source: q.giver,
            name: q.name,
            isGM,
            isHidden: q.isHidden,
            isInactive: q.isInactive,
            isPersonal: q.isPersonal,
            personalActors: q.personalActors,
            hasObjectives: q.hasObjectives,
            subquests,
            tasks
         };
      });
   }

   /**
    * Some game systems and custom UI theming modules provide hard overrides on overflow-x / overflow-y styles. Alas we
    * need to set these for '.window-content' to 'visible' which will cause an issue for very long tables. Thus we must
    * manually set the table max-heights based on the position / height of the {@link Application}.
    *
    * @param {object}               [opts] - Optional parameters.
    *
    * @param {number|null}          [opts.left] - The left offset position in pixels.
    *
    * @param {number|null}          [opts.top] - The top offset position in pixels.
    *
    * @param {number|null}          [opts.width] - The application width in pixels.
    *
    * @param {number|string|null}   [opts.height] - The application height in pixels.
    *
    * @param {number|null}          [opts.scale] - The application scale as a numeric factor where 1.0 is default.
    *
    * @param {boolean}              [opts.pinned] -
    *
    * @returns {{left: number, top: number, width: number, height: number, scale:number}}
    * The updated position object for the application containing the new values.
    */
   setPosition({ pinned = this._pinned, ...opts } = {})
   {
      // Pin width / height to min / max styles if defined.
      if (opts)
      {
         if (typeof opts.width === 'number' && typeof opts.height === 'number')
         {
            if (opts.width < this._appExtents.minWidth) { opts.width = this._appExtents.minWidth; }
            if (opts.width > this._appExtents.maxWidth) { opts.width = this._appExtents.maxWidth; }
            if (opts.height < this._appExtents.minHeight) { opts.height = this._appExtents.minHeight; }
            if (opts.height > this._appExtents.maxHeight) { opts.height = this._appExtents.maxHeight; }

            if (!this._windowResizable)
            {
               // Add the extra `2` for small format (1080P and below screen size).
               opts.height = this._elemWindowHeader[0].scrollHeight + this._elemWindowContent[0].scrollHeight + 2;
            }
         }

         if (typeof opts.left === 'number' && typeof opts.top === 'number')
         {
            if (pinned)
            {
               opts.left = this.position.left;
               opts.top = this.position.top;
            }
         }

         // Mutates `opts` to set maximum left position.
         SidebarManager.checkPosition(opts);
      }

      // Must set popOut temporarily to true as there is a gate in `Application.setPosition`.
      this.options.popOut = true;
      const currentPosition = super.setPosition(opts);
      this.options.popOut = false;

      if (!this._windowResizable)
      {
         const el = this.element[0];
         const tHeight = this._elemWindowHeader[0].scrollHeight + this._elemWindowContent[0].scrollHeight + 2;
         el.style.height = `${tHeight}px`;
      }

      const scrollbarActive = this._elemWindowContent[0].scrollHeight > this._elemWindowContent[0].clientHeight;

      if (scrollbarActive !== this._scrollbarActive)
      {
         this._scrollbarActive = scrollbarActive;
         this._elemQuestTracker.css('pointer-events', scrollbarActive ? 'auto' : 'none');
      }

      if (currentPosition && currentPosition.width && currentPosition.height)
      {
         if (_timeoutPosition)
         {
            clearTimeout(_timeoutPosition);
         }

         _timeoutPosition = setTimeout(() =>
         {
            game.settings.set(constants.moduleName, settings.questTrackerPosition, JSON.stringify(currentPosition));
         }, s_TIMEOUT_POSITION);
      }

      return currentPosition;
   }
}

/**
 * Defines the timeout length to gate saving position to settings.
 *
 * @type {number}
 */
const s_TIMEOUT_POSITION = 1000;

/**
 * Stores the last call to setTimeout for {@link QuestTracker.setPosition} changes, so that they can be cancelled as
 * new updates arrive gating the calls to saving position to settings.
 *
 * @type {number}
 * @private
 */
let _timeoutPosition = void 0;