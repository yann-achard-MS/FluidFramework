/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";
import { AnchorSet, Delta, JsonableTree } from "../tree";
import { ChangeEncoder } from "./changeEncoder";

export interface ChangeFamily<TEditor, TChange, TAbstractChange = unknown> {
    buildEditor(
        deltaReceiver: (delta: Delta.Root) => void,
        changeConcretizer: (change: TAbstractChange) => TChange,
        anchorSet: AnchorSet,
    ): TEditor;
    intoDelta(change: TChange): Delta.Root;
    concretize(change: TAbstractChange, tree: JsonableTree | undefined): TChange;
    readonly rebaser: ChangeRebaser<TChange, TAbstractChange>;
    readonly encoder: ChangeEncoder<TAbstractChange>;
}
