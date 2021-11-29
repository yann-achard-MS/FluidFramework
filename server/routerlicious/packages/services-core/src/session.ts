/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ISession {
    documentId: string;
    ordererUrl: string;
    historianUrl: string;
    isSessionAlive: boolean;
}
