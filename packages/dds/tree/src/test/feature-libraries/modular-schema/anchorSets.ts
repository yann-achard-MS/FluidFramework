/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldAnchorSetOps,
	AnchorSetShape,
	AnchorSetOpsURIs,
	SequenceAnchorSetTypes,
	sequenceFieldAnchorSetOps,
	SlotAnchorSetTypes,
	slotFieldAnchorSetOps,
} from "../../../feature-libraries";

const NoChangeSlotAnchorSetURI = "NoChangeSlotAnchorSetURI";

// Registers NoRebaseSlotAnchorSet as a concrete implementation of the FieldAnchorSetOps concern
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[NoChangeSlotAnchorSetURI]: SlotAnchorSetTypes<TData, 0>;
	}
}

const noChangeSlotFieldAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSlotAnchorSetURI> = {
	rebase: () => {},
	...slotFieldAnchorSetOps,
};

const NoChangeSequenceAnchorSetURI = "NoChangeSequenceAnchorSetURI";

// Registers SequenceFieldAnchorSet as the concrete implementation of the concern AnchorSet
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[NoChangeSequenceAnchorSetURI]: SequenceAnchorSetTypes<TData, 0>;
	}
}

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const noChangeSequenceAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSequenceAnchorSetURI> = {
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
