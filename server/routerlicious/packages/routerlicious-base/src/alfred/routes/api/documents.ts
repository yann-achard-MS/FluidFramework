/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    IDocumentStorage,
    IThrottler,
    ITenantManager,
    ICache,
    MongoManager,
} from "@fluidframework/server-services-core";
import {
    verifyStorageToken,
    throttle,
    IThrottleMiddlewareOptions,
    getParam,
} from "@fluidframework/server-services-utils";
import { Router } from "express";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Constants, handleResponse, createSession, getSessionInfo } from "../../../utils";

export function create(
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    config: Provider,
    tenantManager: ITenantManager,
    globalDbMongoManager?: MongoManager): Router {
    const router: Router = Router();

    // Whether to enforce server-generated document ids in create doc flow
    const enforceServerGeneratedDocumentId: boolean = config.get("alfred:enforceServerGeneratedDocumentId") ?? false;

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
        throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
    };

    router.get(
        "/:tenantId/:id",
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const documentP = storage.getDocument(
                getParam(request.params, "tenantId") || appTenants[0].id,
                getParam(request.params, "id"));
            documentP.then(
                (document) => {
                    if (!document || document.scheduledDeletionTime) {
                        response.status(404);
                    }
                    response.status(200).json(document);
                },
                (error) => {
                    response.status(400).json(error);
                });
    });

    /**
     * Creates a new document with initial summary.
     */
    router.post(
        "/:tenantId",
        verifyStorageToken(tenantManager, config, {
            requireDocumentId: false,
            ensureSingleUseToken: true,
            singleUseTokenCache,
        }),
        throttle(throttler, winston, commonThrottleOptions),
        async (request, response, next) => {
            console.log("001 Come to alfred endpoint");
            // Tenant and document
            const tenantId = getParam(request.params, "tenantId");
            // If enforcing server generated document id, ignore id parameter
            const id = enforceServerGeneratedDocumentId
                ? uuid()
                : request.body.id as string || uuid();

            const ordererUrl = request.headers.host ?? "";
            let historianUrl: string = "";
            if (ordererUrl.includes("alfred")) {
                historianUrl = ordererUrl.replace("alfred", "historian");
            } else if (ordererUrl.includes("local")) {
                historianUrl = "localhost:3001";
            }

            // Summary information
            const summary = request.body.summary;
            Lumberjack.info(`002.1 Print out the ${JSON.stringify(request.headers.host)}`);

            // Protocol state
            const sequenceNumber = request.body.sequenceNumber;
            const values = request.body.values;

            const createP = storage.createDocument(
                tenantId,
                id,
                summary,
                sequenceNumber,
                1,
                crypto.randomBytes(4).toString("hex"),
                values);

            const sessionP = await createSession(globalDbMongoManager, id, ordererUrl, historianUrl);
            handleResponse(createP.then(() => sessionP), response, undefined, 201);
        });

    /**
     * Get the session url.
     */
     router.get(
        "/:tenantId/session/:id",
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        async (request, response, next) => {
            console.log("0001 Come to alfred get documentId endpoint");
            const documentId = getParam(request.params, "id");
            const ordererUrl = request.headers.host ?? "";
            let historianUrl: string = "";
            if (ordererUrl.includes("alfred")) {
                historianUrl = ordererUrl.replace("alfred", "historian");
            } else if (ordererUrl.includes("local")) {
                historianUrl = "localhost:3001";
            }
            const sessionP = getSessionInfo(globalDbMongoManager, documentId, ordererUrl, historianUrl);
            handleResponse(sessionP, response, undefined, 201);
        });
    return router;
}
