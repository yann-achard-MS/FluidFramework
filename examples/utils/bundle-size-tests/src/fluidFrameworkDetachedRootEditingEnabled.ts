/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { configuredSharedTreeAlpha, DetachedRootEditing } from "fluid-framework/alpha";

export const SharedTree = configuredSharedTreeAlpha({
	enableDetachedRootEditing: DetachedRootEditing,
});
