/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SchemaAndPolicy,
	FieldKey,
	TreeFieldStoredSchema,
	TreeTypeSet,
} from "../core/index.js";
import { dummyRoot, keyAsDetachedField } from "../core/index.js";
import {
	type FlexTreeContext,
	getSchemaAndPolicy,
	type FlexTreeHydratedContextMinimal,
	FieldKinds,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type FlexTreeNode,
	cursorForMapTreeField,
	throwOutOfSchema,
	type TreeChunk,
	type HydratedFlexTreeNode,
	type MinimalMapTreeNodeView,
	type FlexTreeField,
	type DetachedRootIds,
} from "../feature-libraries/index.js";
import { normalizeFieldSchema, type ImplicitAnnotatedFieldSchema } from "./fieldSchema.js";
import {
	type InsertableContent,
	flexTreeFromInsertable,
} from "./unhydratedFlexTreeFromInsertable.js";
import {
	createField,
	getKernel,
	UnhydratedFlexTreeNode,
	type ImplicitAnnotatedAllowedTypes,
	type TreeNode,
	type UnhydratedFlexTreeField,
} from "./core/index.js";
import { assert, fail } from "@fluidframework/core-utils/internal";
import { isFieldInSchema } from "../feature-libraries/index.js";
import { getUnhydratedContext } from "./createContext.js";
import { convertField, permissiveStoredSchemaGenerationOptions } from "./toStoredSchema.js";

/**
 * For now, schema validation for inserted content is always enabled.
 * @remarks
 * If this ends up being too much of a performance overhead, AND nothing depends on it (like staged allowed types likely will),
 * this could be changed.
 */
const validateSchema = true;

// IDEA:
// Have prepareForInsertion return a TreeChunk, and a function which should be called after its insertion with the path to its location (as Inner node?)

/**
 * Prepare content from a user for insertion into a tree.
 * @remarks
 * This validates and converts the input, and if necessary invokes {@link prepareContentForHydration}.
 *
 * The next edit made to `destinationContext`'s forest must be the creation of a detached field containing this content,
 * (Triggering {@link ForestEvents.afterRootFieldCreated}) otherwise hydration will break.
 */
export function prepareForInsertion<TIn extends InsertableContent | undefined>(
	data: TIn,
	schema: ImplicitAnnotatedFieldSchema,
	destinationContext: FlexTreeContext,
	destinationSchema: TreeFieldStoredSchema,
): TIn extends undefined ? undefined : FlexibleNodeContent {
	const content = prepareForInsertionContextlessInternal(
		data,
		schema,
		getSchemaAndPolicy(destinationContext),
		destinationContext.isHydrated() ? destinationContext : undefined,
		destinationSchema,
	);

	assert(content.toAttach !== undefined, "Expected toAttach to be defined");
	assert(content.toAttach.length < 2, "Expected toAttach to be a single element on none");

	// TODO: when supporting back compat to not edit detached fields, caller will have to finalize after attaching to in document location.
	content.finalize(content.toAttach);
	return (
		content.toAttach.length === 0 ? undefined : content.toAttach[1]
	) as TIn extends undefined ? undefined : FlexibleNodeContent;
}

/**
 * {@link prepareForInsertion} but batched for array content.
 * @remarks
 * This is for inserting items into an array, not a inserting a {@link TreeArrayNode} (that would use {@link prepareForInsertion}).
 *
 * The next edits made to `destinationContext`'s forest must be the creation of a detached field.
 * One edit for each item in `data`, in order.
 *
 * @privateRemarks
 * This has to be done as a single operation for all items in data
 * (as opposed to mapping {@link prepareForInsertion} over the array)
 * due to how the eventing in prepareContentForHydration works.
 */
export function prepareArrayContentForInsertion(
	data: readonly InsertableContent[],
	schema: ImplicitAnnotatedAllowedTypes,
	destinationContext: FlexTreeContext,
	destinationSchema: TreeTypeSet,
): FlexibleFieldContent {
	const mapTrees: FlexTreeNode[] = data.map((item) => flexTreeFromInsertable(item, schema));

	const fieldSchema = convertField(
		normalizeFieldSchema(schema),
		permissiveStoredSchemaGenerationOptions,
	);

	const normalizedFieldSchema = normalizeFieldSchema(schema);
	const field = createField(
		getUnhydratedContext(normalizedFieldSchema).flexContext,
		fieldSchema.kind,
		dummyRoot,
		mapTrees,
	);

	const content = validateAndPrepare(
		getSchemaAndPolicy(destinationContext),
		destinationContext.isHydrated() ? destinationContext : undefined,
		{
			kind: FieldKinds.sequence.identifier,
			types: destinationSchema,
			persistedMetadata: undefined,
		},
		field,
	);

	assert(content.toAttach !== undefined, "Expected toAttach to be defined");

	// TODO: when supporting back compat to not edit detached fields, caller will have to finalize after attaching to in document location.
	content.finalize(content.toAttach);
	return content.toAttach;
}

export interface PreparedContent {
	/**
	 * New content which to be attached. Rooted in detached fields.
	 * @remarks
	 * When destination is a hydrated context, this will contain hydrated flex tree nodes.
	 * The corresponding TreeNodes will not yet be hydrated, and some subtrees may be in separate detached fields.
	 *
	 * TODO: Eventually, this should be a single detached field, not an array of nodes each in their own detached field.
	 */
	readonly toAttach?: readonly FlexTreeNode[];

	/**
	 * Location of toAttach.
	 * @remarks
	 * This is redundant with `toAttach.key` but in a different format/type.
	 * Only provided for hydrated destinations.
	 */
	readonly rootIds?: DetachedRootIds;

	/**
	 * Finalizes the prepared content. Moves in missing subtrees from detached fields, and hydrates TreeNodes as needed.
	 *
	 * @param attached - The nodes that were attached to the tree.
	 *
	 * @remarks
	 * Call this exactly once, after `toAttach` has been attached to its final location.
	 * There must be no app facing events between creation of this `PreparedContent` and its finalization since during this time TreeNodes may be in an invalid state (inner node hydrated, but TreeNode not).
	 *
	 * The implementation of this must not assume the context provided to `prepareForInsertion*` is still valid.
	 */
	readonly finalize: (attached: readonly FlexTreeNode[]) => void;
}

/**
 * This exists to handle the required root initialize case where the flex tree nodes get invalidated by a schema change and thus new node instances need to be provided.
 */
export interface PreparedContentInitialize extends PreparedContent {
	/**
	 * {@inheritDoc PreparedContent.rootIds}
	 */
	readonly rootIds: DetachedRootIds;
}

/**
 * This exists to handle the required root initialize case where the flex tree nodes get invalidated by a schema change and thus new node instances need to be provided.
 */
export interface PreparedContentRegular extends PreparedContent {
	/**
	 * {@inheritDoc PreparedContent.toAttach}
	 */
	readonly toAttach: readonly FlexTreeNode[];

	/**
	 * {@link PreparedContent.finalize} but without `attached` parameter: assumes `toAttach` is the same is still valid and uses that.
	 */
	readonly finalize: () => void;
}

/**
 * Split out from {@link prepareForInsertion} as to allow use without a context.
 *
 * @param hydratedData - If specified, the `mapTrees` will be prepared for hydration into this context.
 * `undefined` when `mapTrees` are being inserted into an {@link Unhydrated} tree.
 *
 * @remarks
 * Adding this entry point is a workaround for initialize not currently having a context.
 */
export function prepareForInsertionContextless<TIn extends InsertableContent | undefined>(
	data: TIn,
	schema: ImplicitAnnotatedFieldSchema,
	schemaAndPolicy: SchemaAndPolicy,
	hydratedData: FlexTreeHydratedContextMinimal,
	destinationSchema: TreeFieldStoredSchema,
): PreparedContentInitialize {
	const final = prepareForInsertionContextlessInternal(
		data,
		schema,
		schemaAndPolicy,
		hydratedData,
		destinationSchema,
	);
	assert(final.rootIds !== undefined, "Expected rootIds to be defined");
	assert(
		final.rootIds.length <= 1,
		"Expected at most one node to be returned from prepareForInsertionContextless",
	);

	// For some reason TypeScript can't figure out that final.rootIds is defined unless we handle is separately.
	return { ...final, rootIds: final.rootIds };
}

/**
 * Split out from {@link prepareForInsertion} as to allow use without a context.
 *
 * @param hydratedData - If specified, the `mapTrees` will be prepared for hydration into this context.
 * `undefined` when `mapTrees` are being inserted into an {@link Unhydrated} tree.
 */
function prepareForInsertionContextlessInternal<TIn extends InsertableContent | undefined>(
	data: TIn,
	schema: ImplicitAnnotatedFieldSchema,
	schemaAndPolicy: SchemaAndPolicy,
	hydratedData: FlexTreeHydratedContextMinimal | undefined,
	destinationSchema: TreeFieldStoredSchema,
): PreparedContent {
	const mapTree = flexTreeFromInsertable(data, schema);

	const contentArray = mapTree === undefined ? [] : [mapTree];
	const normalizedFieldSchema = normalizeFieldSchema(schema);
	const fieldSchema = convertField(
		normalizedFieldSchema,
		permissiveStoredSchemaGenerationOptions,
	);

	const field = createField(
		getUnhydratedContext(normalizedFieldSchema).flexContext,
		fieldSchema.kind,
		dummyRoot,
		contentArray,
	);

	return validateAndPrepare(schemaAndPolicy, hydratedData, destinationSchema, field);
}

/**
 * If hydrating, do a final validation against the schema and prepare the content for hydration.
 *
 * @param hydratedData - If specified, the `mapTrees` will be prepared for hydration into this context.
 * `undefined` when `mapTrees` are being inserted into an {@link Unhydrated} tree.
 *
 * TODO: return nodes flex tree nodes to insert (might be newly hydrated) or reused unhydrated nodes when hydratedData is undefined.
 */
function validateAndPrepare(
	schemaAndPolicy: SchemaAndPolicy,
	hydratedData: FlexTreeHydratedContextMinimal | undefined,
	fieldSchema: TreeFieldStoredSchema,
	field: UnhydratedFlexTreeField,
): PreparedContent {
	const cleanup = (): void => {
		// Discard the parent dummy field for the nodes before returning so they are unparented and can be inserted.
		for (const child of field.children) {
			assert(child instanceof UnhydratedFlexTreeNode, "TODO");
			child.adoptBy(undefined);
		}
	};

	if (hydratedData !== undefined) {
		// Run `chunkForInsertion` before walking the tree in `isFieldInSchema`.
		// This ensures that when `isFieldInSchema` requests identifiers (or any other contextual defaults),
		// they were already creating used the more specific context we have access to from `hydratedData`.
		const chunk = chunkForInsertion(hydratedData, field);
		// TODO: AB#45723
		// Now that staged schema rely on this validation, its a bit odd we don't do it for insertion into unhydrated contexts.
		// We can't simply enable it for them however due to contextual default fields which would not have been created yet (see comment above).
		// Specifically at least clone can result in unhydrated trees which can end up violating their stored schema (but not view schema) just using the type safe APIs.
		if (validateSchema === true) {
			isFieldInSchema(field, fieldSchema, schemaAndPolicy, throwOutOfSchema);
		}

		const rootIds = hydratedData.checkout.editor.buildRoots(chunk.chunk);
		const fields = hydratedData.checkout.getRemovedRootsFields(rootIds);
		console.log(`built nodes: ${JSON.stringify(fields)}`);

		const toAttach =
			hydratedData.detachedField === undefined
				? undefined
				: fields.map((f) => {
						assert(
							hydratedData.detachedField !== undefined,
							"detachedField should not stop being defined",
						);
						const rootField = hydratedData.detachedField(
							keyAsDetachedField(f),
							FieldKinds.optional.identifier,
						);
						assert(rootField.length === 1, "Expected single root in detached field");
						return rootField.boxedAt(0) ?? fail("Expected root to be present");
					});

		return {
			toAttach,
			rootIds,
			finalize: (attached: readonly FlexTreeNode[]) => {
				// do edits to move existing content into newly built tree and hydrate nodes as needed
				attachAndHydratedNodes([...attached], chunk.attaches);
				cleanup();
			},
		};
	} else {
		return { toAttach: field.children, finalize: cleanup };
	}
}

/**
 * A field to insert, which can contain some attach operations for already hydrated content.
 */
interface ChunkedInsertion<TChunk = TreeChunk> {
	readonly chunk: TChunk;
	readonly attaches: readonly SubFieldAttach[];
}

type SubFieldAttach = SubFieldAttachHydrated | SubFieldAttachUnhydrated;

/**
 * A an unhydrated subtree is being attached to a hydrated context and it
 * contains content which need fixing up after the initial creation in the hydrated context.
 *
 */
interface SubFieldAttachUnhydrated {
	readonly type: "unhydrated";
	readonly index: number;
	/**
	 * If provided a preexisting TreeNode which was unhydrated was attached.
	 *
	 * It will require hydration to associate the existing TreeNode with the new hydrated flex-tree node.
	 */
	readonly toHydrate: TreeNode | undefined;
	readonly content: Map<FieldKey, readonly SubFieldAttach[]>;
}

/**
 * A preexisting TreeNode which was already hydrated was attached.
 *
 * It will require an attach to move its existing flex-tree node to the new location.
 */
interface SubFieldAttachHydrated {
	readonly type: "hydrated";
	readonly index: number;
	readonly content: HydratedFlexTreeNode;
}

function chunkForInsertion(
	context: FlexTreeHydratedContextMinimal,
	field: UnhydratedFlexTreeField,
): ChunkedInsertion {
	const x = chunkFieldForInsertion(context, field);
	const chunk = context.checkout.forest.chunkField(cursorForMapTreeField(x.chunk));
	return {
		chunk,
		attaches: x.attaches,
	};
}

function chunkFieldForInsertion(
	context: FlexTreeHydratedContextMinimal,
	field: UnhydratedFlexTreeField,
): ChunkedInsertion<readonly MinimalMapTreeNodeView[]> {
	const chunk: MinimalMapTreeNodeView[] = [];
	const attaches: SubFieldAttach[] = [];
	for (const [i, child] of field.children.entries()) {
		if (child.isHydrated()) {
			// TODO: error if there is a hydrated parent.
			attaches.push({
				index: i,
				content: child,
				type: "hydrated",
			});
		} else {
			assert(
				child instanceof UnhydratedFlexTreeNode,
				"Expected child to be an UnhydratedFlexTreeNode",
			);
			const fields: Map<FieldKey, readonly MinimalMapTreeNodeView[]> = new Map();
			const childAttaches: Map<FieldKey, readonly SubFieldAttach[]> = new Map();
			for (const [key, fieldInner] of child.allFieldsLazy) {
				fieldInner.fillPendingDefaults(context);
				const inner = chunkFieldForInsertion(context, fieldInner);
				fields.set(key, inner.chunk);
				childAttaches.set(key, inner.attaches);
			}
			// As an optimization, if there are no attach data, skip tracking it.
			if (childAttaches.size !== 0 || child.treeNode !== undefined) {
				attaches.push({
					index: i,
					toHydrate: child.treeNode,
					content: childAttaches,
					type: "unhydrated",
				});
			}
			chunk.push({ type: child.type, value: child.value, fields });
		}
	}
	return {
		chunk,
		attaches,
	};
}

function attachAndHydratedNodes(
	field: FlexTreeField | FlexTreeNode[],
	attaches: readonly SubFieldAttach[],
): void {
	for (const attach of attaches) {
		if (attach.type === "hydrated") {
			// TODO: suppress events for these attaches?

			if (Array.isArray(field)) {
				// Move items after attach over by 1.
				for (let index = field.length; index > attach.index; index--) {
					field[index] = field[index - 1] ?? fail("No item at index");
				}
				field[attach.index] = attach.content;
			} else if (field.is(FieldKinds.sequence)) {
				field.editor.insert(attach.index, [attach.content]);
			} else if (field.is(FieldKinds.optional)) {
				assert(field.length === 0, "Expected empty field for hydrated attach");
				field.editor.set(attach.content, false);
			} else {
				// TODO: ensure a good user facing error for this case.
				fail("Invalid field kind for hydrated attach");
			}
		} else {
			const child =
				(Array.isArray(field) ? field[attach.index] : field.boxedAt(attach.index)) ??
				fail("No child at index");
			if (attach.toHydrate !== undefined) {
				assert(child.isHydrated(), "Expected child to be hydrated");
				getKernel(attach.toHydrate).hydrate(child);
			}
			for (const [key, children] of attach.content) {
				const childField = child.getBoxed(key);
				attachAndHydratedNodes(childField, children);
			}
		}
	}
}
