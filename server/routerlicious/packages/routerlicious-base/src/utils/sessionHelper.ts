/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, IDocument, IDocumentSession, ISession } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

// export async function createSession(globalDbMongoManager: MongoManager,
//                                     documentId: string,
//                                     ordererUrl: string,
//                                     historianUrl: string): Promise<ISession> {
//     if (globalDbMongoManager === undefined) {
//         const session: ISession = {
//             documentId,
//             ordererUrl,
//             historianUrl,
//             isSessionAlive: null,
//         };
//         return session;
//     }
//     const db = await globalDbMongoManager.getDatabase();
//     const collection = db.collection("sessions");
//     Lumberjack.info(`Fetch the session method`);
//     const result = await collection.findOrCreate(
//         {
//             documentId,
//         },
//         {
//             documentId,
//             ordererUrl,
//             historianUrl,
//             isSessionAlive: true,
//         });

//     return result.value as ISession;
// }

export async function getSession(globalDbMongoManager: MongoManager,
    documentId: string,
    ordererUrl: string,
    historianUrl: string): Promise<IDocumentSession> {
    if (globalDbMongoManager === undefined) {
        const sessionP: ISession = {
            ordererUrl,
            historianUrl,
            isSessionAlive: null,
        };
        const documentSessionP: IDocumentSession = {
            documentId,
            session: sessionP,
        };
        return documentSessionP;
    }

    const db = await globalDbMongoManager.getDatabase();
    const collection = db.collection("documents");
    Lumberjack.info(`Get the session method`);
    const result = await collection.findOne({ documentId });
    const session = JSON.parse((result as IDocument).session) as ISession;
    const deli = JSON.parse((result as IDocument).deli);
    const scribe = JSON.parse((result as IDocument).scribe);
    if (!session.isSessionAlive) {
        // Reset logOffset, ordererUrl, and historianUrl when switching cluster.
        if (session.ordererUrl !== ordererUrl) {
            deli.logOffset = -1;
            scribe.logOffset = -1;
            session.ordererUrl = ordererUrl;
            session.historianUrl = historianUrl;
        }
        session.isSessionAlive = true;
        (result as IDocument).deli = JSON.stringify(deli);
        (result as IDocument).scribe = JSON.stringify(scribe);
        (result as IDocument).session = JSON.stringify(session);
        await collection.upsert({
            documentId,
        }, {
            deli: (result as IDocument).deli,
            scribe: (result as IDocument).scribe,
            session: (result as IDocument).session,
        }, {
        });
    }
    const documentSession: IDocumentSession = {
        documentId,
        session: JSON.parse((result as IDocument).session) as ISession,
    };
    return documentSession;
}
