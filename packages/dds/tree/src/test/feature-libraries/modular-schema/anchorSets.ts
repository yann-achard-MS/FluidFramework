/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldAnchorSetOps,
	AnchorSetContainer,
	AnchorSetOpsURIs,
	SequenceAnchorSetTypes,
	sequenceFieldAnchorSetOps,
	SlotAnchorSetTypes,
	slotFieldAnchorSetOps,
} from "../../../feature-libraries";

const NoChangeSlotAnchorSetURI = "NoChangeSlotAnchorSetURI";

const noChangeSlotFieldAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSlotAnchorSetURI> = {
	rebase: () => {},
	composeWith: () => {},
	...slotFieldAnchorSetOps,
};

const NoChangeSequenceAnchorSetURI = "NoChangeSequenceAnchorSetURI";

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const noChangeSequenceAnchorSetOps: FieldAnchorSetOps<typeof NoChangeSequenceAnchorSetURI> = {
	rebase: () => {},
	composeWith: () => {},
	...sequenceFieldAnchorSetOps,
};

declare module "../../../feature-libraries/modular-schema/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[NoChangeSlotAnchorSetURI]: SlotAnchorSetTypes<TData, 0>;
		[NoChangeSequenceAnchorSetURI]: SequenceAnchorSetTypes<TData, 0>;
	}
}

// --- Usage example

function use<TSet extends AnchorSetOpsURIs>(
	set: AnchorSetContainer<TSet, string>,
	ops: FieldAnchorSetOps<TSet>,
) {
	return ops.map(set, (s: string) => 42);
}

const fIn = slotFieldAnchorSetOps.factory<string>();
const bIn = sequenceFieldAnchorSetOps.factory<string>();
const fOut = use(fIn, noChangeSlotFieldAnchorSetOps);
const bOut = use(bIn, noChangeSequenceAnchorSetOps);
