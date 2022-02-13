import {Resolver} from "./worker_util"

export class Singleton <T> {
    private _item: T = undefined;
    private _resolvers: Resolver[] = [];
    private _cnstr: new (...args: any[]) => T;

    public constructor (cnstr: new (...args: any[]) => T) {
        this._cnstr = cnstr;
    }

    public make (...args: any[]): T {
        if (this._item) return this._item;
        this._item = new this._cnstr(...args);
        while (this._resolvers.length){
            this._resolvers.pop().resolve(this._item);
        }
        return this._item;
    }

    public get (): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this._item) {
                this._resolvers.push({resolve, reject});
            }
            else {
                resolve(this._item);
            }
        });
    }

    public created (): boolean{
        return !!this._item;
    }

}