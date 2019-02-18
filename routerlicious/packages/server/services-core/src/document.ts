import { ICommit, ICommitDetails, ITree } from "@prague/gitresources";
import { IRangeTrackerSnapshot } from "@prague/utils";

export interface IDocumentDetails {
    existing: boolean;
    value: IDocument;
}

export interface IFullTree {
    // All trees contained in the commit (includes submodules)
    trees: Map<string, ITree>;

    // Commits for each module
    modules: Map<string, ICommit>;
}

export interface IDocumentStorage {
    getDocument(tenantId: string, documentId: string): Promise<any>;

    getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails>;

    getLatestVersion(tenantId: string, documentId: string): Promise<ICommit>;

    getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

    getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

    getFullTree(tenantId: string, documentId: string, commit: ICommit): Promise<IFullTree>;

    getForks(tenantId: string, documentId: string): Promise<string[]>;

    createFork(tenantId: string, id: string): Promise<string>;
}

export interface IFork {
    // The id of the fork
    documentId: string;

    // Tenant for the fork
    tenantId: string;

    // The sequence number where the fork originated
    sequenceNumber: number;

    // The last forwarded sequence number
    lastForwardedSequenceNumber: number;
}

export interface IDocument {
    createTime: number;

    documentId: string;

    tenantId: string;

    forks: IFork[];

    /**
     * Parent references the point from which the document was branched
     */
    parent: {
        documentId: string,

        sequenceNumber: number,

        tenantId: string;

        minimumSequenceNumber: number;
    };

    // TODO package up the below under some kind of deli object
    // Deli specific information - we might want to consolidate this into a field to separate it
    clients: [{
        // Whether deli is allowed to evict the client from the MSN queue (i.e. due to timeouts, etc...)
        canEvict: boolean,

        clientId: string,

        clientSequenceNumber: number,

        referenceSequenceNumber: number,

        lastUpdate: number,

        nack: boolean,
    }];

    branchMap: IRangeTrackerSnapshot;

    sequenceNumber: number;

    logOffset: number;
}
