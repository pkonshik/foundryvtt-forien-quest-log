import Fetch         from '../control/Fetch.js';
import { constants } from './constants.js';

// Stores any Foundry sheet class to be used to render quest. Primarily used in content linking.
let SheetClass;

/**
 * Class that acts "kind of" like Entity, to help Manage everything Quest Related
 * in a more structured way, than to call JournalEntry every time.
 */
export default class Quest
{
   constructor(data = {}, entry = null)
   {
      this._id = data.id || null;  // Foundry in the TextEditor system to create content links looks for `_id` & name.
      this.initData(data);
      this.entry = entry;
      this.data = data;
   }

   get id()
   {
      return this._id;
   }

   set id(id)
   {
      this._id = id;
   }

   get isObservable()
   {
      return game.user.isGM ||
       (this.entry && this.entry.testUserPermission(game.user, CONST.ENTITY_PERMISSIONS.OBSERVER));
   }

   get isOwner()
   {
      return game.user.isGM ||
       (this.entry && this.entry.testUserPermission(game.user, CONST.ENTITY_PERMISSIONS.OWNER));
   }

   get name()
   {
      return this._name;
   }

   set name(value)
   {
      this._name =
       typeof value === 'string' && value.length > 0 ? value : game.i18n.localize('ForienQuestLog.NewQuest');
   }

   /**
    * Creates new and adds Reward to reward array of quest.
    *
    * @param data
    */
   addReward(data = {})
   {
      const reward = new Reward(data);
      if (reward.type !== null) { this.rewards.push(reward); }
   }

   /**
    * Creates new and adds Quest to task array of quest.
    *
    * @param questId
    */
   addSubquest(questId)
   {
      this.subquests.push(questId);
   }

   /**
    * Creates new and adds Task to task array of quest.
    *
    * @param data
    */
   addTask(data = {})
   {
      const task = new Task(data);
      if (task.name.length) { this.tasks.push(task); }
   }

   async delete()
   {
      const parentQuest = Fetch.quest(this.parent);
      let parentId = null;

      // Stores the quest IDs which have been saved and need GUI / display aspects updated.
      const savedIDs = [];

      // Remove this quest from any parent
      if (parentQuest)
      {
         parentId = parentQuest._id;
         parentQuest.removeSubquest(this._id);
      }

      // Update children to point to any new parent.
      for (const childId of this.subquests)
      {
         const childQuest = Fetch.quest(childId);
         if (childQuest)
         {
            childQuest.parent = parentId;

            await childQuest.save();
            savedIDs.push(childQuest._id);

            // Update parent with new subquests.
            if (parentQuest)
            {
               parentQuest.addSubquest(childQuest._id);
            }
         }
      }

      if (parentQuest)
      {
         await parentQuest.save();
         savedIDs.push(parentQuest._id);
      }

      if (this.entry)
      {
         await this.entry.delete();
      }

      // Return the delete and saved IDs.
      return {
         deleteID: this._id,
         savedIDs
      };
   }

   /**
    * Returns any stored Foundry sheet class.
    *
    * @returns {*}
    */
   static getSheet() { return SheetClass; }

   /**
    * Normally would be in constructor(), but is extracted for usage in different methods as well
    *
    * @param data
    *
    * @see refresh()
    */
   initData(data)
   {
      this.giver = data.giver || null;
      this.name = data.name || game.i18n.localize('ForienQuestLog.NewQuest');
      this.status = data.status || 'hidden';
      this.description = data.description || '';
      this.gmnotes = data.gmnotes || '';
      this.image = data.image || 'actor';
      this.giverName = data.giverName || 'actor';
      this.giverImgPos = data.giverImgPos || 'center';
      this.splash = data.splash || '';
      this.splashPos = data.splashPos || 'center';
      this.parent = data.parent || null;
      this.subquests = data.subquests || [];
      this.tasks = [];
      this.rewards = [];
      this.tasks = Array.isArray(data.tasks) ? data.tasks.map((task) => new Task(task)) : [];
      this.rewards = Array.isArray(data.rewards) ? data.rewards.map((reward) => new Reward(reward)) : [];
   }

   /**
    * Moves Quest (and Journal Entry) to different Folder.
    *
    * @param target
    *
    * @returns {Promise<void>}
    */
   async move(target)
   {
      // TODO: REMOVE WHEN ALL QUESTS HAVE JOURNAL ENTRIES GUARANTEED
      if (!this.entry) { return; }

      this.status = target;

      await this.entry.update({
         flags: {
            [constants.moduleName]: { json: this.toJSON() }
         }
      });

      return this._id;
   }

   /**
    * Refreshes data without need of destroying and reinstantiating Quest object
    */
   refresh()
   {
      const entry = game.journal.get(this._id);
      const content = Fetch.content(entry);

      this.initData(content);
   }

   /**
    * Deletes Reward from Quest
    *
    * @param {number} index
    */
   removeReward(index)
   {
      if (this.rewards[index] !== void 0) { this.rewards.splice(index, 1); }
   }

   /**
    * Deletes Task from Quest
    *
    * @param {number} questId
    */
   removeSubquest(questId)
   {
      this.subquests = this.subquests.filter((id) => id !== questId);
   }

   /**
    * Deletes Task from Quest
    *
    * @param {number} index
    */
   removeTask(index)
   {
      if (this.tasks[index] !== void 0) { this.tasks.splice(index, 1); }
   }

   /**
    * Saves Quest to JournalEntry's content, and if needed, moves JournalEntry to different folder.
    * Can also update JournalEntry's permissions.
    *
    * @returns {Promise<string>} The ID of the quest saved.
    */
   async save()
   {
      const entry = game.journal.get(this._id);

      // If the entry doesn't exist or the user can't modify the journal entry via ownership then early out.
      if (!entry || !entry.canUserModify(game.user, 'update')) { return; }

      const update = {
         name: typeof this._name === 'string' && this._name.length > 0 ? this._name :
          game.i18n.localize('ForienQuestLog.NewQuest'),
         flags: {
            [constants.moduleName]: { json: this.toJSON() }
         }
      };

      await entry.update(update, { diff: false });

      return this._id;
   }

   /**
    * Sets any stored Foundry sheet class.
    *
    * @returns {*}
    */
   static setSheet(NewSheetClass) { SheetClass = NewSheetClass; }

   sortRewards(index, targetIdx)
   {
      const entry = this.rewards.splice(index, 1)[0];
      if (targetIdx) { this.rewards.splice(targetIdx, 0, entry); }
      else { this.rewards.push(entry); }
   }

   sortTasks(index, targetIdx)
   {
      const entry = this.tasks.splice(index, 1)[0];
      if (targetIdx) { this.tasks.splice(targetIdx, 0, entry); }
      else { this.tasks.push(entry); }
   }

   toJSON()
   {
      return {
         giver: this.giver,
         name: this._name,
         status: this.status,
         description: this.description,
         gmnotes: this.gmnotes,
         image: this.image,
         giverName: this.giverName,
         giverImgPos: this.giverImgPos,
         splashPos: this.splashPos,
         splash: this.splash,
         parent: this.parent,
         subquests: this.subquests,
         tasks: this.tasks,
         rewards: this.rewards
      };
   }

   /**
    * Toggles Actor image between sheet's and token's images
    */
   toggleImage()
   {
      this.image = this.image === 'actor' ? 'token' : 'actor';
   }

   /**
    * Toggles visibility of Reward
    *
    * @param {number}   index - Reward index
    */
   toggleReward(index)
   {
      this.rewards[index]?.toggleVisible();
   }

   /**
    * Toggles visibility of Task
    *
    * @param {number}   index - Task index
    */
   toggleTask(index)
   {
      this.tasks[index]?.toggleVisible();
   }

// Document simulation -----------------------------------------------------------------------------------------------

   /**
    * The canonical name of this Document type, for example "Actor".
    *
    * @type {string}
    */
   static get documentName()
   {
      return 'Quest';
   }

   get documentName()
   {
      return 'Quest';
   }

   /**
    * This mirrors document.sheet and is used in TextEditor._onClickContentLink
    *
    * @returns {object} An associated sheet instance.
    */
   get sheet()
   {
      return SheetClass ? new SheetClass(this) : void 0;
   }

   /**
    * Test whether a certain User has a requested permission level (or greater) over the Document.
    * This mirrors document.testUserPermission and forwards on the request to the backing journal entry.
    *
    * @param {documents.BaseUser} user       The User being tested
    *
    * @param {string|number} permission      The permission level from ENTITY_PERMISSIONS to test
    *
    * @param {object} options                Additional options involved in the permission test
    *
    * @param {boolean} [options.exact=false]     Require the exact permission level requested?
    *
    * @returns {boolean}                      Does the user have this permission level over the Document?
    */
   testUserPermission(user, permission, options)
   {
      const entry = game.journal.get(this._id);
      return entry.testUserPermission(user, permission, options);
   }
}

class Reward
{
   constructor(data = {})
   {
      this.type = data.type || null;
      this.data = data.data || {};
      this.hidden = data.hidden || false;
   }

   toJSON()
   {
      return JSON.parse(JSON.stringify({
         type: this.type,
         data: this.data,
         hidden: this.hidden
      }));
   }

   toggleVisible()
   {
      this.hidden = !this.hidden;
      return this.hidden;
   }
}

class Task
{
   constructor(data = {})
   {
      this.name = data.name || null;
      this.completed = data.completed || false;
      this.failed = data.failed || false;
      this.hidden = data.hidden || false;
   }

   get state()
   {
      if (this.completed)
      {
         return 'check-square';
      }
      else if (this.failed)
      {
         return 'minus-square';
      }
      return 'square';
   }

   toJSON()
   {
      return JSON.parse(JSON.stringify({
         name: this.name,
         completed: this.completed,
         failed: this.failed,
         hidden: this.hidden,
         state: this.state
      }));
   }

   toggle()
   {
      if (this.completed === false && this.failed === false)
      {
         this.completed = true;
      }
      else if (this.completed === true)
      {
         this.failed = true;
         this.completed = false;
      }
      else
      {
         this.failed = false;
      }
   }

   toggleVisible()
   {
      this.hidden = !this.hidden;

      return this.hidden;
   }
}