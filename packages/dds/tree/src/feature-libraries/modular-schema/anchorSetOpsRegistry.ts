/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSetAspects, UnknownAnchorSetOps } from "./anchorSetOps";

/**
 * Global registry that maps implementation URIs to their concrete types.
 * @param TData - The type of data stored in individual anchors.
 */
export interface AnchorSetOpsRegistry<TData> {
	[UnknownAnchorSetOps]: AnchorSetAspects;
}
