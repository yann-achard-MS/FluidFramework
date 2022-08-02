# Supported Intentions

This document provides a list of low-level editing intentions supported by SharedTree out of the box.

## Terminology

The descriptions below use the term "concurrent(ly)" to describe edits made by peers where those edits...
- were not yet known to the local client at the time it made its edits
- are sequenced prior to the local client's edits.

## Intentions on History

### Undo

> Status: not implemented

## Intentions on Nodes

### Set Value

> Status: implemented for non-concurrent edits.

Sets the value of a node, replacing the existing one if any.

## Intentions on Value Fields

A value field is a field with exactly one item.

### Set

> Status: not implemented

Replaces the existing item with another.

## Intentions on Optional Fields

An optional field is a field with zero or one item.

### Set

> Status: not implemented

Populates the field with an item, potentially replacing the existing one if any.

### Clear

> Status: not implemented

Deletes the existing item if any.

## Intentions on Sequence Fields

A sequence field is a field with zero or more items arranged sequentially.

### Insert

> Status: implemented for non-concurrent edits.

Inserts new items at a specific location in the sequence.

If the parent of the field is concurrently deleted,
then the insert edit has no effect.

If items in the field are concurrently deleted with a set-delete,
then the insert location is updated to produce the same result as though the insert had happened first and the delete second.

If items in the field are concurrently deleted with a slice-delete,
and if the anchor used to indicate the insertion location 
then the insert location is updated to produce the same result as though the insert had happened first and the delete second.

If some content is concurrently inserted (or moved-in) at the same location,
then the content inserted by this edit will be inserted either directly before or after it
(this is specified by the caller of insert).

### Delete Set

> Status: implemented for non-concurrent edits.

Deletes a set of contiguous nodes.

Nodes that are concurrently moved are still in the set and will be deleted wherever they may be at the time the edit is applied.
This is true even if the set becomes disjoint/is no longer contiguous.

Nodes are that concurrently deleted are still considered in the set but deletion is idempotent so deleting a deleted node has no effect.

If a node in the set is concurrently deleted and such a deletion is then undone
(also concurrently) then the node will be deleted by this operation.

### Delete Slice

> Status: not implemented

### Move Set

> Status: not implemented

### Move Slice

> Status: not implemented