/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails, ICreateCommitParams } from "@fluidframework/gitresources";
import {
    IDocumentAttributes,
    ICommittedProposal,
    ISequencedDocumentMessage,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    IGitCache,
    SummaryTreeUploadManager,
    WholeSummaryUploadManager,
} from "@fluidframework/server-services-client";
import {
    ICollection,
    IDeliState,
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    IScribe,
    ITenantManager,
    SequencedOperationType,
    IDocument,
    ISequencedOperationMessage,
    ISession,
    MongoManager,
} from "@fluidframework/server-services-core";
import * as winston from "winston";
import { toUtf8 } from "@fluidframework/common-utils";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { MongoDbFactory } from "./mongodb";

export class DocumentStorage implements IDocumentStorage {
    constructor(
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly enableWholeSummaryUpload: boolean,
    ) { }

    /**
     * Retrieves database details for the given document
     */
    public async getDocument(tenantId: string, documentId: string): Promise<IDocument> {
        const collection = await this.databaseManager.getDocumentCollection();
        return collection.findOne({ documentId, tenantId });
    }

    public async getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

        return getOrCreateP;
    }

    private createInitialProtocolTree(
        documentId: string,
        sequenceNumber: number,
        term: number,
        values: [string, ICommittedProposal][],
    ): ISummaryTree {
        const documentAttributes: IDocumentAttributes = {
            branch: documentId,
            minimumSequenceNumber: sequenceNumber,
            sequenceNumber,
            term,
        };

        const summary: ISummaryTree = {
            tree: {
                attributes: {
                    content: JSON.stringify(documentAttributes),
                    type: SummaryType.Blob,
                },
                quorumMembers: {
                    content: JSON.stringify([]),
                    type: SummaryType.Blob,
                },
                quorumProposals: {
                    content: JSON.stringify([]),
                    type: SummaryType.Blob,
                },
                quorumValues: {
                    content: JSON.stringify(values),
                    type: SummaryType.Blob,
                },
            },
            type: SummaryType.Tree,
        };

        return summary;
    }

    private createFullTree(appTree: ISummaryTree, protocolTree: ISummaryTree): ISummaryTree {
        if (this.enableWholeSummaryUpload) {
            return {
                type: SummaryType.Tree,
                tree: {
                    ".protocol": protocolTree,
                    ".app": appTree,
                },
            };
        } else {
            return {
                type: SummaryType.Tree,
                tree: {
                    ".protocol": protocolTree,
                    ...appTree.tree,
                },
            };
        }
    }

    public async createDocument(
        tenantId: string,
        documentId: string,
        appTree: ISummaryTree,
        sequenceNumber: number,
        term: number,
        initialHash: string,
        values: [string, ICommittedProposal][],
    ): Promise<IDocumentDetails> {
        Lumberjack.info("004.1 Come to createDocument method");
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        Lumberjack.info("004.2 Come to tenant");
        const gitManager = tenant.gitManager;

        const messageMetaData = { documentId, tenantId };
        const lumberjackProperties = {
            [BaseTelemetryProperties.tenantId]: tenantId,
            [BaseTelemetryProperties.documentId]: documentId,
        };

        Lumberjack.info("004.3 come to gitmanager,messagemetadata, and so on");
        const protocolTree = this.createInitialProtocolTree(documentId, sequenceNumber, term, values);
        const fullTree = this.createFullTree(appTree, protocolTree);

        const blobsShaCache = new Map<string, string>();
        const uploadManager = this.enableWholeSummaryUpload ?
            new WholeSummaryUploadManager(gitManager) :
            new SummaryTreeUploadManager(gitManager, blobsShaCache, () => undefined);
        const handle = await uploadManager.writeSummaryTree(fullTree, "", "container", 0);

        winston.info(`Tree reference: ${JSON.stringify(handle)}`, { messageMetaData });
        Lumberjack.info(`Tree reference: ${JSON.stringify(handle)}`, lumberjackProperties);
        Lumberjack.info(`005 Tree reference: ${JSON.stringify(handle)}`);

        if (!this.enableWholeSummaryUpload) {
            const commitParams: ICreateCommitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "Routerlicious Service",
                },
                message: "New document",
                parents: [],
                tree: handle,
            };

            const commit = await gitManager.createCommit(commitParams);
            await gitManager.createRef(documentId, commit.sha);

            winston.info(`Commit sha: ${JSON.stringify(commit.sha)}`, { messageMetaData });
            Lumberjack.info(`Commit sha: ${JSON.stringify(commit.sha)}`, lumberjackProperties);
            Lumberjack.info(`006 Commit sha: ${JSON.stringify(commit.sha)}`);
        }

        const deli: IDeliState = {
            clients: undefined,
            durableSequenceNumber: sequenceNumber,
            expHash1: initialHash,
            logOffset: -1,
            sequenceNumber,
            epoch: undefined,
            term: 1,
            lastSentMSN: 0,
            nackMessages: undefined,
            successfullyStartedLambdas: [],
        };
        Lumberjack.info(`007 Initize deli`);

        const scribe: IScribe = {
            logOffset: -1,
            minimumSequenceNumber: sequenceNumber,
            protocolState: {
                members: [],
                minimumSequenceNumber: sequenceNumber,
                proposals: [],
                sequenceNumber,
                values,
            },
            sequenceNumber,
            lastClientSummaryHead: undefined,
            lastSummarySequenceNumber: 0,
        };
        Lumberjack.info(`008 Initize scribe`);

        const collection = await this.databaseManager.getDocumentCollection();
        Lumberjack.info(`009 Get the collection`);
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                createTime: Date.now(),
                deli: JSON.stringify(deli),
                documentId,
                scribe: JSON.stringify(scribe),
                tenantId,
                version: "0.1",
            });

        Lumberjack.info(`010 Get the result`);
        return result;
    }

    public async createFRSDocumentUrl(documentId: string, ordererUrl: string, historianUrl: string): Promise<ISession> {
        // const collection = await this.databaseManager.getDocumentUrlCollection();
        // eslint-disable-next-line max-len
        const mongoUrl = "mongodb://tianzhu-test-cosmosdbafd-001:Wb0qjXmrHQSW0zqtFADshZASoCS9gvQ727PTfejcegfSbDIauIYx170xLbRcDq5cQ0Y2fctz1YK5TF6SJkoUvw==@tianzhu-test-cosmosdbafd-001.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@tianzhu-test-cosmosdbafd-001@";
        const mongoFactory = new MongoDbFactory(mongoUrl);
        const mongoManager = new MongoManager(mongoFactory, false);
        const db = await mongoManager.getDatabase();
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

    public async getFRSDocumentUrl(documentId: string, ordererUrl: string, historianUrl: string): Promise<ISession>  {
        // const collection = await this.databaseManager.getDocumentUrlCollection();
        // eslint-disable-next-line max-len
        const mongoUrl = "mongodb://tianzhu-test-cosmosdbafd-001:Wb0qjXmrHQSW0zqtFADshZASoCS9gvQ727PTfejcegfSbDIauIYx170xLbRcDq5cQ0Y2fctz1YK5TF6SJkoUvw==@tianzhu-test-cosmosdbafd-001.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@tianzhu-test-cosmosdbafd-001@";
        const mongoFactory = new MongoDbFactory(mongoUrl);
        const mongoManager = new MongoManager(mongoFactory, false);
        const db = await mongoManager.getDatabase();
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

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
        const versions = await this.getVersions(tenantId, documentId, 1);
        if (!versions.length) {
            return null;
        }

        const latest = versions[0];
        return {
            author: latest.commit.author,
            committer: latest.commit.committer,
            message: latest.commit.message,
            parents: latest.parents,
            sha: latest.sha,
            tree: latest.commit.tree,
            url: latest.url,
        };
    }

    public async getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommits(documentId, count);
    }

    public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommit(sha);
    }

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const versions = await tenant.gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            return { cache: { blobs: [], commits: [], refs: { [documentId]: null }, trees: [] }, code: null };
        }

        const fullTree = await tenant.gitManager.getFullTree(versions[0].sha);

        let code: string = null;
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(toUtf8(blob.content, blob.encoding)) as
                        [string, { value: string }][];

                    for (const quorumValue of quorumValues) {
                        if (quorumValue[0] === "code") {
                            code = quorumValue[1].value;
                            break;
                        }
                    }

                    break;
                }
            }
        }

        return {
            cache: {
                blobs: fullTree.blobs,
                commits: fullTree.commits,
                refs: { [documentId]: versions[0].sha },
                trees: fullTree.trees,
            },
            code,
        };
    }

    private async createObject(
        collection: ICollection<IDocument>,
        tenantId: string,
        documentId: string,
        deli?: string,
        scribe?: string): Promise<IDocument> {
        const value: IDocument = {
            createTime: Date.now(),
            deli,
            documentId,
            scribe,
            tenantId,
            version: "0.1",
        };
        await collection.insertOne(value);
        return value;
    }

    // Looks up the DB and summary for the document.
    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const document = await collection.findOne({ documentId, tenantId });
        if (document === null) {
            // Guard against storage failure. Returns false if storage is unresponsive.
            const foundInSummaryP = this.readFromSummary(tenantId, documentId).then((result) => {
                return result;
            }, (err) => {
                winston.error(`Error while fetching summary for ${tenantId}/${documentId}`);
                winston.error(err);
                const lumberjackProperties = {
                    [BaseTelemetryProperties.tenantId]: tenantId,
                    [BaseTelemetryProperties.documentId]: documentId,
                };
                Lumberjack.error(`Error while fetching summary`, lumberjackProperties);
                return false;
            });

            const inSummary = await foundInSummaryP;

            // Setting an empty string to deli and scribe denotes that the checkpoints should be loaded from summary.
            const value = inSummary ?
                await this.createObject(collection, tenantId, documentId, "", "") :
                await this.createObject(collection, tenantId, documentId);

            return {
                value,
                existing: inSummary,
            };
        } else {
            return {
                value: document,
                existing: true,
            };
        }
    }

    private async readFromSummary(tenantId: string, documentId: string): Promise<boolean> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (existingRef) {
            // Fetch ops from logTail and insert into deltas collection.
            // TODO: Make the rest endpoint handle this case.
            const opsContent = await gitManager.getContent(existingRef.object.sha, ".logTail/logTail");
            const ops = JSON.parse(
                Buffer.from(
                    opsContent.content,
                    Buffer.isEncoding(opsContent.encoding) ? opsContent.encoding : undefined,
                ).toString(),
            ) as ISequencedDocumentMessage[];
            const dbOps: ISequencedOperationMessage[] = ops.map((op: ISequencedDocumentMessage) => {
                return {
                    documentId,
                    operation: op,
                    tenantId,
                    type: SequencedOperationType,
                    mongoTimestamp: new Date(op.timestamp),
                };
            });
            const opsCollection = await this.databaseManager.getDeltaCollection(tenantId, documentId);
            await opsCollection
                .insertMany(dbOps, false)
                // eslint-disable-next-line @typescript-eslint/promise-function-async
                .catch((error) => {
                    // Duplicate key errors are ignored
                    if (error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
            winston.info(`Inserted ${dbOps.length} ops into deltas DB`);
            const lumberjackProperties = {
                [BaseTelemetryProperties.tenantId]: tenantId,
                [BaseTelemetryProperties.documentId]: documentId,
            };
            Lumberjack.info(`Inserted ${dbOps.length} ops into deltas DB`, lumberjackProperties);
            return true;
        } else {
            return false;
        }
    }
}
