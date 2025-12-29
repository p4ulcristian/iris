import { motion } from 'framer-motion'
import EntityCard from './EntityCard'

/**
 * EntityGroup - Renders a stage's entities as stacked cards
 *
 * Solo stage (1 entity): Renders like a regular EntityCard
 * Multi-entity stage (2+ entities): Cards stacked with slight Y offset, focused on top
 */
export default function EntityGroup({
  stage,
  entities,  // Array of entity objects for this stage
  isFocused,
  focusedEntityId,
  onClick,
  onClose,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab
}) {
  // Get the focused entity (or first entity if none focused)
  const effectiveFocusedId = focusedEntityId || entities[0]?.id
  const focusedEntity = entities.find(e => e.id === effectiveFocusedId) || entities[0]
  const otherEntities = entities.filter(e => e.id !== effectiveFocusedId)

  // Solo stage - just render a regular EntityCard
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
        disableReorder
      />
    )
  }

  // Multi-entity stage - render stacked cards with shadow effect
  return (
    <motion.div
      className="relative group"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Stacked shadow cards behind (creates depth illusion) */}
      {otherEntities.length > 0 && (
        <>
          {/* Shadow card 2 (deepest) */}
          {otherEntities.length > 1 && (
            <div
              className="absolute inset-0 rounded-xl bg-white/5 border border-white/10"
              style={{
                transform: 'translateY(8px) scale(0.96)',
                zIndex: 0
              }}
            />
          )}
          {/* Shadow card 1 */}
          <div
            className="absolute inset-0 rounded-xl bg-white/10 border border-white/15"
            style={{
              transform: 'translateY(4px) scale(0.98)',
              zIndex: 1
            }}
          />
        </>
      )}

      {/* Focused entity card on top (fully interactive) */}
      <div className="relative" style={{ zIndex: 10 }}>
        <EntityCard
          entity={focusedEntity}
          isActive={isFocused}
          onClick={() => onClick(focusedEntity.id)}
          onClose={() => onClose(focusedEntity.id)}
          tabs={tabs}
          activeTabId={activeTabId}
          onMoveToTab={onMoveToTab}
          onMoveToNewTab={onMoveToNewTab}
          disableReorder
        />

        {/* Stack indicator badge */}
        <div
          className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-[10px] text-white font-medium"
          title={`${entities.length} entities on this stage`}
        >
          {entities.length}
        </div>
      </div>
    </motion.div>
  )
}
