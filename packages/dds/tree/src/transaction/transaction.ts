/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEditableForest, IForestSubscription } from "../forest";
import { ChangeFamily, ProgressiveEditBuilder } from "../change-family";
import { TransactionResult } from "../checkout";
import { treeFromForest } from "../util";

/**
 * The interface a checkout has to implement for a transaction to be able to be applied to it.
 */
export interface Checkout<TEditor, TChangeConcrete, TChangeAbstract = TChangeConcrete> {
    readonly forest: IEditableForest;
    readonly changeFamily: ChangeFamily<TEditor, TChangeConcrete, TChangeAbstract>;
    submitEdit(edit: TChangeAbstract): void;
}

/**
 * Keeps a forest in sync with a ProgressiveEditBuilder.
 */
class Transaction<
    TEditor extends ProgressiveEditBuilder<TChange, TWireChange>,
    TChange,
    TWireChange,
> {
    public readonly editor: TEditor;
    constructor(
        private readonly forest: IEditableForest,
        changeFamily: ChangeFamily<TEditor, TChange, TWireChange>,
    ) {
        this.editor = changeFamily.buildEditor(
            (delta) => this.forest.applyDelta(delta),
            (change) => changeFamily.concretize(change, treeFromForest(forest)),
            forest.anchors,
        );
    }
}

export function runSynchronousTransaction<
    TEditor extends ProgressiveEditBuilder<TConcreteChange, TWireChange>,
    TConcreteChange,
    TWireChange = TConcreteChange,
>(
    checkout: Checkout<TEditor, TConcreteChange, TWireChange>,
    command: (
        forest: IForestSubscription,
        editor: TEditor
    ) => TransactionResult,
): TransactionResult {
    const t = new Transaction(checkout.forest, checkout.changeFamily);
    const result = command(checkout.forest, t.editor);
    const concreteChanges = t.editor.getConcreteChanges();
    const abstractChanges = t.editor.getAbstractChanges();
    const concreteEdit = checkout.changeFamily.rebaser.compose(concreteChanges);
    const abstractEdit = checkout.changeFamily.rebaser.composeAbstract(abstractChanges);

    // TODO: in the non-abort case, optimize this to not rollback the edit,
    // then reapply it (when the local edit is added) when possible.
    {
        // Roll back changes
        const inverse = checkout.changeFamily.rebaser.invert(concreteEdit);

        // TODO: maybe unify logic to edit forest and its anchors here with that in ProgressiveEditBuilder.
        // TODO: update schema in addition to anchors and tree data (in both places).
        checkout.changeFamily.rebaser.rebaseAnchors(checkout.forest.anchors, inverse);
        checkout.forest.applyDelta(checkout.changeFamily.intoDelta(inverse));
    }

    if (result === TransactionResult.Apply) {
        checkout.submitEdit(abstractEdit);
    }

    return result;
}
