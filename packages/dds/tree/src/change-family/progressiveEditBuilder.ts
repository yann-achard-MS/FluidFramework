/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet, Delta } from "../tree";
import { ChangeFamily } from "./changeFamily";

export abstract class ProgressiveEditBuilder<TConcreteChange, TWireChange = TConcreteChange> {
    private readonly concrete: TConcreteChange[] = [];
    private readonly abstract: TWireChange[] = [];
    constructor(
        private readonly changeFamily: ChangeFamily<unknown, TConcreteChange, TWireChange>,
        private readonly deltaReceiver: (delta: Delta.Root) => void,
        private readonly changeConcretizer: (change: TWireChange) => TConcreteChange,
        private readonly anchorSet: AnchorSet) {}

    /**
     * Subclasses add editing methods which call this with their generated edits.
     *
     * @sealed
     */
    protected applyChange(change: TWireChange): void {
        this.abstract.push(change);
        const concrete = this.changeConcretizer(change);
        this.concrete.push(concrete);
        this.changeFamily.rebaser.rebaseAnchors(this.anchorSet, concrete);
        const delta = this.changeFamily.intoDelta(concrete);
        this.deltaReceiver(delta);
    }

    /**
     * @returns a copy of the internal change list so far.
     * @sealed
     */
    public getConcreteChanges(): TConcreteChange[] {
        return [...this.concrete];
    }
    public getAbstractChanges(): TWireChange[] {
        return [...this.abstract];
    }
}
