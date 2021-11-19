/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IGlobalDatabaseManager } from "./database";
import { ISession } from "./document";
import { MongoManager } from "./mongo";

/**
 * MongoDB implementation of GlobalMongoDatabaseManager
 */
export class GlobalMongoDatabaseManager implements IGlobalDatabaseManager {
    constructor(
        private readonly mongoManager: MongoManager) {
    }

    public async getSessionCollection(): Promise<ICollection<ISession>> {
        return this.getCollection<ISession>("sessions");
    }

    private async getCollection<T>(name: string) {
        const db = await this.mongoManager.getDatabase();
        return db.collection<T>(name);
    }
}
