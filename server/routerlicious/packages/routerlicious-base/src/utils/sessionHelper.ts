/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISession,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export async function createSession(globalDbMongoManager: MongoManager,
                                    documentId: string,
                                    ordererUrl: string,
                                    historianUrl: string): Promise<ISession> {
    const db = await globalDbMongoManager.getDatabase();
    const collection = db.collection("sessions");
    Lumberjack.info(`Fetch the documentUrl method`);
    const result = await collection.findOrCreate(
        {
            documentId,
        },
        {
            documentId,
            ordererUrl,
            historianUrl,
            isSessionAlive: true,
        });

    return result.value as ISession;
}

export async function getSessionInfo(globalDbMongoManager: MongoManager,
                                     documentId: string,
                                     ordererUrl: string,
                                     historianUrl: string): Promise<ISession>  {
    const db = await globalDbMongoManager.getDatabase();
    const collection = db.collection("sessions");
    Lumberjack.info(`Get the documentUrl method`);
    let result = await collection.findOne(
        {
            documentId,
        });
    if ((result as ISession).isSessionAlive === false) {
        await collection.upsert({
            documentId,
        }, {
            documentId,
            ordererUrl,
            historianUrl,
            isSessionAlive: true,
        }, {
        });
        result = await collection.findOne(
        {
            documentId,
        });
    }
    return result as ISession;
}
