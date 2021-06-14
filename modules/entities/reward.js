export default class Reward
{
   constructor(data = {})
   {
      this._type = data.type || null;
      this._data = data.data || {};
      this._hidden = data.hidden || false;
   }

   get data()
   {
      return this._data;
   }

   set data(data)
   {
      this._data = data;
   }

   get hidden()
   {
      return this._hidden;
   }

   set hidden(value)
   {
      this._hidden = value;
   }

   get isValid()
   {
      return (this._type !== null);
   }

   get type()
   {
      return this._type;
   }

   set type(type)
   {
      this._type = type;
   }

   // TODO: Consider removing (06/12/21) mleahy
   static create(data = {})
   {
      if (data.type === undefined)
      {
         throw new Error(game.i18n.localize('ForienQuestLog.Api.reward.create.type'));
      }
      if (data.data === undefined || data.data.name === undefined || data.data.img === undefined)
      {
         throw new Error(game.i18n.localize('ForienQuestLog.Api.reward.create.data'));
      }

      return new Reward(data);
   }

   toJSON()
   {
      return {
         type: this._type,
         data: this._data,
         hidden: this._hidden
      };
   }

   async toggleVisible()
   {
      this._hidden = !this._hidden;

      return this._hidden;
   }
}
