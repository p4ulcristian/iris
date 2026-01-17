import { useEffect, useRef, useState, memo } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import EntityCard from './EntityCard'
import DropIndicator from './DropIndicator'

/**
 * EntityGroup - Renders a stage's entities
 *
 * Solo stage (1 entity): Single EntityCard
 * Multi-entity stage (2+ entities): Vertical list inside a group container
 *
 * Drop behavior:
 * - Drop on a card in SAME stage → reorder within stage
 * - Drop on a SOLO stage from different stage → create new stage at position (reorder stages)
 * - Drop on a MULTI stage from different stage → join that stage
 *
 * staggerOffset: The number of entities that come before this group (for stagger animation)
 */
export default memo(function EntityGroup({
  stage,
  entities,
  isFocused,
  focusedEntityId,
  onClick,
  onClose,
  onSplit,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
  staggerOffset = 0,
  stageIndex = 0,
  totalStages = 1
}) {
  const wrapperRef = useRef(null)

  const isSoloStage = entities.length === 1

  // Solo stage - single EntityCard with drop target
  if (isSoloStage) {
    return (
      <div
        ref={wrapperRef}
        style={{
          transition: 'transform 0.2s ease-out' // CSS transition for layout reordering
        }}
      >
        <EntityCardDropTarget
          entity={entities[0]}
          entityIndex={0}
          stageId={stage.id}
          stageIndex={stageIndex}
          isSoloStage={true}
          isActive={isFocused}
          onClick={() => onClick(entities[0].id)}
          onClose={() => onClose(entities[0].id)}
          tabs={tabs}
          activeTabId={activeTabId}
          onMoveToTab={onMoveToTab}
          onMoveToNewTab={onMoveToNewTab}
          staggerIndex={staggerOffset}
          disableAnimation={true}
          onReorderInStage={onReorderInStage}
          onJoinStage={onJoinStage}
          onCreateStageAtPosition={onCreateStageAtPosition}
        />
      </div>
    )
  }

  // Multi-entity stage - vertical list inside group container
  return (
    <div
      ref={wrapperRef}
      style={{
        transition: 'transform 0.2s ease-out' // CSS transition for layout reordering
      }}
    >
      <div className="entity-group flex flex-col gap-2 p-2 rounded-2xl border border-white/20 bg-white/5">
        {entities.map((entity, idx) => (
          <EntityCardDropTarget
            key={entity.id}
            entity={entity}
            entityIndex={idx}
            stageId={stage.id}
            stageIndex={stageIndex}
            isSoloStage={false}
            isActive={isFocused && entity.id === focusedEntityId}
            onClick={() => onClick(entity.id)}
            onClose={() => onClose(entity.id)}
            onSplit={() => onSplit?.(entity.id)}
            tabs={tabs}
            activeTabId={activeTabId}
            onMoveToTab={onMoveToTab}
            onMoveToNewTab={onMoveToNewTab}
            staggerIndex={staggerOffset + idx}
            disableAnimation={true}
            onReorderInStage={onReorderInStage}
            onJoinStage={onJoinStage}
            onCreateStageAtPosition={onCreateStageAtPosition}
            totalInStage={entities.length}
          />
        ))}
      </div>
    </div>
  )
})

/**
 * EntityCardDropTarget - Wraps EntityCard with drop target behavior
 */
const EntityCardDropTarget = memo(function EntityCardDropTarget({
  entity,
  entityIndex,
  stageId,
  stageIndex,
  isSoloStage,
  isActive,
  onClick,
  onClose,
  onSplit,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab,
  staggerIndex,
  disableAnimation,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
  totalInStage = 1
}) {
  const dropRef = useRef(null)
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null })

  useEffect(() => {
    const el = dropRef.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        return attachClosestEdge(
          { targetStageId: stageId, targetEntityIndex: entityIndex, targetEntityId: entity.id },
          { element, input, allowedEdges: ['top', 'bottom'] }
        )
      },
      canDrop: ({ source }) => {
        // Only accept 'move' source (entity cards)
        if (source.data.source !== 'move') return false
        // Don't drop on self
        if (source.data.entityId === entity.id) return false
        return true
      },
      onDragEnter: ({ self }) => {
        const edge = extractClosestEdge(self.data)
        setDropState({ isDraggedOver: true, closestEdge: edge })
      },
      onDrag: ({ self }) => {
        const edge = extractClosestEdge(self.data)
        setDropState(prev => prev.closestEdge !== edge ? { isDraggedOver: true, closestEdge: edge } : prev)
      },
      onDragLeave: () => {
        setDropState({ isDraggedOver: false, closestEdge: null })
      },
      onDrop: ({ self, source }) => {
        setDropState({ isDraggedOver: false, closestEdge: null })

        const { entityId: draggedEntityId, stageId: sourceStageId } = source.data
        const edge = extractClosestEdge(self.data)

        if (sourceStageId === stageId) {
          // Same stage: reorder within
          let targetIndex = entityIndex
          if (edge === 'bottom') {
            targetIndex = entityIndex + 1
          }
          onReorderInStage?.(stageId, draggedEntityId, targetIndex)
        } else if (isSoloStage) {
          // Different stage, target is solo: create new stage at position (reorder stages)
          const position = edge === 'top' ? stageIndex : stageIndex + 1
          onCreateStageAtPosition?.(draggedEntityId, sourceStageId, position)
        } else {
          // Different stage, target is multi-entity: join this stage
          let targetIndex = entityIndex
          if (edge === 'bottom') {
            targetIndex = entityIndex + 1
          }
          onJoinStage?.(draggedEntityId, sourceStageId, stageId, targetIndex)
        }
      }
    })
  }, [stageId, stageIndex, entityIndex, entity.id, isSoloStage, onReorderInStage, onJoinStage, onCreateStageAtPosition])

  return (
    <div
      ref={dropRef}
      className="relative"
      style={{ transition: 'transform 0.2s ease-out' }} // CSS transition for reordering
    >
      {/* Drop indicator - top */}
      <DropIndicator
        variant="edge"
        position="top"
        label="Insert above"
        visible={dropState.isDraggedOver && dropState.closestEdge === 'top'}
      />

      <EntityCard
        entity={entity}
        isActive={isActive}
        onClick={onClick}
        onClose={onClose}
        onSplit={onSplit}
        tabs={tabs}
        activeTabId={activeTabId}
        onMoveToTab={onMoveToTab}
        onMoveToNewTab={onMoveToNewTab}
        staggerIndex={staggerIndex}
        disableAnimation={disableAnimation}
        stageId={stageId}
        entityIndex={entityIndex}
      />

      {/* Drop indicator - bottom */}
      <DropIndicator
        variant="edge"
        position="bottom"
        label="Insert below"
        visible={dropState.isDraggedOver && dropState.closestEdge === 'bottom'}
      />
    </div>
  )
})
