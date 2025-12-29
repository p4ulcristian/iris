import { motion } from 'framer-motion'
import EntityCard from './EntityCard'

/**
 * EntityGroup - Renders a stage's entities
 *
 * Solo stage (1 entity): Renders EntityCard directly
 * Multi-entity stage (2+ entities): Vertical list inside a group container
 */
export default function EntityGroup({
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
  onMoveToNewTab
}) {
  // Solo stage - just render EntityCard directly
  if (entities.length === 1) {
    return (
      <EntityCard
        entity={entities[0]}
        isActive={isFocused}
        onClick={() => onClick(entities[0].id)}
        onClose={() => onClose(entities[0].id)}
        tabs={tabs}
        activeTabId={activeTabId}
        onMoveToTab={onMoveToTab}
        onMoveToNewTab={onMoveToNewTab}
      />
    )
  }

  // Multi-entity stage - vertical list inside group container
  return (
    <motion.div
      className="flex flex-col gap-2 p-2 rounded-2xl border border-white/20 bg-white/5"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {entities.map((entity) => (
        <EntityCard
          key={entity.id}
          entity={entity}
          isActive={isFocused && entity.id === focusedEntityId}
          onClick={() => onClick(entity.id)}
          onClose={() => onClose(entity.id)}
          onSplit={() => onSplit?.(entity.id)}
          tabs={tabs}
          activeTabId={activeTabId}
          onMoveToTab={onMoveToTab}
          onMoveToNewTab={onMoveToNewTab}
        />
      ))}
    </motion.div>
  )
}
