/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../feature-libraries";
import { JsonableTree } from "../tree";
import { TreeNavigationResult } from "./cursorLegacy";
import { IForestSubscription } from "./forest";

export function treeFromForest(forest: IForestSubscription): JsonableTree | undefined {
    const cursor = forest.allocateCursor();
    const destination = forest.root(forest.rootField);
    const cursorResult = forest.tryMoveCursorTo(destination, cursor);
    if (cursorResult !== TreeNavigationResult.Ok) {
        cursor.free();
        forest.forgetAnchor(destination);
        return undefined;
    }
    const json = jsonableTreeFromCursor(cursor);
    cursor.free();
    forest.forgetAnchor(destination);
    return json;
}
