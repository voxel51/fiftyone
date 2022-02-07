
export enum LogLevel {
    NONE = 0,
    INFO = 1,
    DEBUG = 2
};

export class WorkerBase {
    protected _className: string;
    protected _workerID: number;
    protected _logLevel: LogLevel;

    protected _initializeWorker (name: string, id: number, log_level: LogLevel): void {
        this._className = name;
        this._workerID = id;
        this._logLevel = log_level;
    }

    protected _formatMessage (str: string): string {
        return `${this._className} ${this._workerID}: ` + str;
    }

    protected _logInfo (str: string) {
        if (this._logLevel > LogLevel.NONE){
            return console.log(this._formatMessage(str));
        }
    }

    protected _logDebug (str: string) {
        if (this._logLevel >= LogLevel.DEBUG){
            return console.log(this._formatMessage(str));
        }
    }
};


export interface Resolver {
    resolve: (_: any) => void;
    reject: (_: any) => void;
}

export interface WorkerConstructor {
    new (): Worker;
}

export type Task = (worker: Worker, id: number) => void;


// TODO: Write/get a proper thread pool implementation.
// I think this doesn't properly handle thread starvation, etc
export abstract class WorkerPool {

    // TODO: Gross hack to allow implementing class
    // to initialize the worker...
    protected _workers: Worker[] = [];


    private _busy: Record<number, boolean> = {};
    private _resolvers: Record<number, Resolver> = {};
    private _back_log: [Task,Resolver][] = [];

    public constructor (workerFn: WorkerConstructor, count: number) {
        for (let i = 0; i < count; i++){
            let worker = new workerFn();
            worker.onmessage = (evt) => { this._handleMessage(i, evt); };
            worker["id"] = i;
            this._workers.push(worker);
        }
    }

    // Parse incoming message, and resolve promise
    public abstract onmessage (resolver: Resolver, event: MessageEvent<any>): any;

    private _handleMessage (id: number, event: MessageEvent<any>): void {
        this.onmessage(this._resolvers[id], event);
        // Immediately put this worker back to work.
        this._executeNext(this._workers[id]);
    }

    private _executeNext (worker: Worker): void {
        let id = worker["id"];
        if (!this._back_log.length){
            // No more tasks at the moment. Free this worker.
            this._busy[id] = false;
        }
        else {
            let [task, resolver] = this._back_log.pop();
            this._executeTask(worker, task, resolver);
        }
    }

    private _executeTask (worker: Worker, task: Task, resolver: Resolver) {
        let id = worker["id"];
        this._busy[id] = true;
        this._resolvers[id] = resolver;
        task(worker, id);
    }

    public execute (task: Task): Promise<any> {
        var resolver = undefined;
        let promise = new Promise((resolve, reject) => {
            resolver = {resolve, reject};
        });

        for (let i = 0; i < this._workers.length; i++){
            let worker = this._workers[i];
            if (!this._busy[i]) {
                this._executeTask(worker, task, resolver);
                return promise;
            }
        }
        this._back_log.push([task, resolver]);
        return promise;
    }
};