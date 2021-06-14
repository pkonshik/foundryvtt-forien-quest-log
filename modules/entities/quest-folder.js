const s_QUEST_DIR_NAME = '_fql_quests';

export default class QuestFolder
{
   /**
    * Returns true if quest directory has been created
    *
    * @returns {boolean}
    */
   static folderExists()
   {
      const result = game.journal.directory.folders.find((f) => f.name === s_QUEST_DIR_NAME);

      return result !== undefined;
   }

   /**
    * Retrieves instance of Quest folder
    *
    * @returns {*}
    */
   static get()
   {
      return game.journal.directory.folders.find((f) => f.name === s_QUEST_DIR_NAME);
   }

   /**
    * Initializes the creation of quest folders
    *
    * @returns {Promise<void>}
    */
   static async initializeJournals()
   {
      const dirExists = this.folderExists();

      if (!dirExists)
      {
         await Folder.create({ name: s_QUEST_DIR_NAME, type: 'JournalEntry', parent: null });
      }

      await game.journal.directory.folders.find((f) => f.name === s_QUEST_DIR_NAME);
   }
}
