/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import URLParse from "url-parse";
import { ISession } from "./contracts";

export const parseFluidUrl = (fluidUrl: string): URLParse => {
    return new URLParse(fluidUrl, true);
};

/**
 * Assume documentId is at end of url path.
 * This is true for Routerlicious' and Tinylicious' documentUrl and deltaStorageUrl.
 * Routerlicious and Tinylicious do not use documentId in storageUrl nor ordererUrl.
 * TODO: Ideally we would be able to regenerate the resolvedUrl, rather than patching the current one.
 */
export const replaceDocumentIdInPath = (urlPath: string, documentId: string): string =>
    urlPath.split("/").slice(0, -1).concat([documentId]).join("/");

export const replaceDomainInPath = (domain: string, url: string): string => {
    const tempUrl = new URL(url);
    tempUrl.hostname = domain;
    return tempUrl.href;
};

export const createFluidUrl = (domain: string, pathname: string): string =>
     "fluid://".concat(domain).concat(pathname);

export const replaceFluidUrl = (resolvedUrl: IFluidResolvedUrl, documentUrl: ISession, parsedUrl: URLParse): void => {
    if (documentUrl.ordererUrl.includes("alfred")) {
        resolvedUrl.url = createFluidUrl(documentUrl.ordererUrl, parsedUrl.pathname);
        resolvedUrl.endpoints.ordererUrl = replaceDomainInPath(documentUrl.ordererUrl,
                                                               resolvedUrl.endpoints.ordererUrl);
        resolvedUrl.endpoints.deltaStorageUrl = replaceDomainInPath(documentUrl.ordererUrl,
                                                                    resolvedUrl.endpoints.deltaStorageUrl);
        resolvedUrl.endpoints.storageUrl = replaceDomainInPath(documentUrl.historianUrl,
                                                               resolvedUrl.endpoints.storageUrl);
    }
};
