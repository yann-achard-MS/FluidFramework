/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldAnchorSetOps,
	defaultCloneFromMap,
	AnchorSetShape,
	AnchorSetOpsURIs,
	SequenceSetTypes,
	sequenceFieldAnchorSetOps,
	SlotAnchorSetTypes,
	slotFieldAnchorSetOps,
} from "../../../feature-libraries";

// URI for the NoRebaseSlotAnchorSet implementation
const NoChangeSlotAnchorSet = "NoChangeSlotAnchorSet";

// Registers NoRebaseSlotAnchorSet as a concrete implementation of the FieldAnchorSetOps concern
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[NoChangeSlotAnchorSet]: SlotAnchorSetTypes<TData, 0>;
	}
}

const noChangeSlotFieldAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSlotAnchorSet> = {
	rebase: () => {},
	clone: defaultCloneFromMap<typeof NoChangeSlotAnchorSet>(slotFieldAnchorSetOps.map),
	...slotFieldAnchorSetOps,
};

// URI for the NoChangeSequenceAnchorSet implementation
const NoChangeSequenceAnchorSet = "NoChangeSequenceAnchorSet";

// Registers SequenceFieldAnchorSet as the concrete implementation of the concern AnchorSet
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[NoChangeSequenceAnchorSet]: SequenceSetTypes<TData, 0>;
	}
}

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const noChangeSequenceAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSequenceAnchorSet> = {
	rebase: () => {},
	...sequenceFieldAnchorSetOps,
};

// --- Usage example

function use<TSet extends AnchorSetOpsURIs>(
	set: AnchorSetShape<TSet, string>,
	ops: FieldAnchorSetOps<TSet>,
) {
	return ops.map(set, (s: string) => 42);
}

const fIn = slotFieldAnchorSetOps.factory<string>();
const bIn = sequenceFieldAnchorSetOps.factory<string>();
const fOut = use(fIn, noChangeSlotFieldAnchorSetOps);
const bOut = use(bIn, noChangeSequenceAnchorSetOps);
