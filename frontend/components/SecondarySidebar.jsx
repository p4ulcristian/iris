import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import EntityGroup from './EntityGroup'
import TileUngroupDropZone from './TileUngroupDropZone'
import EntityIcon from './EntityIcon'

// Animation timing (in ms)
const CARDS_DURATION = 200
const ICONS_DURATION = 200
const WIDTH_DURATION = 150

export default function SecondarySidebar({
  // Data
  allStages,
  globalActiveIdx,
  activeEntities,
  tabs,
  activeTabId,
  focusedEntity,
  effectiveFocusedEntity,
  godColors,
  loadStage,
  initialLoadDone,

  // Sidebar state
  sidebarCollapsed,
  sidebarShowCards,
  sidebarShowIcons,

  // Handlers
  onEntityClick,
  onEntityClose,
  onEntitySplit,
  onMoveToTab,
  onMoveToNewTab,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
}) {
  return (
    <motion.div
      className="flex flex-col overflow-visible relative pr-3"
      animate={{
        width: sidebarCollapsed ? 48 : 288
      }}
      transition={{
        duration: WIDTH_DURATION / 1000,
        ease: 'easeInOut'
      }}
    >
      {/* Two card sets with choreographed animations */}
      <TileUngroupDropZone className="flex-1 relative pb-14">
        {/* Full task cards - scroll by TAB (all stages' cards stacked together per tab) */}
        <AnimatePresence>
          {sidebarShowCards && (
            <motion.div
              key="cards"
              className="absolute inset-0"
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ duration: CARDS_DURATION / 1000, ease: 'easeInOut' }}
            >
              {tabs.length > 0 ? (
                <div className="relative h-full">
                  {/* Render each TAB as one scrolling unit */}
                  {tabs.map((tab, tabIdx) => {
                    const activeTabIdx = tabs.findIndex(t => t.id === activeTabId)
                    const tabOffset = tabIdx - activeTabIdx
                    const isActiveTab = tab.id === activeTabId

                    // Get all stages for this tab
                    const tabStages = allStages
                      ? allStages.filter(item => item.tabId === tab.id && !item.isEmpty)
                      : activeStages.filter(() => tab.id === activeTabId)

                    return (
                      <motion.div
                        key={tab.id}
                        className="absolute inset-0 overflow-y-auto overflow-x-visible pt-3"
                        initial={false}
                        animate={{ y: `${tabOffset * 100}vh` }}
                        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                        style={{
                          pointerEvents: isActiveTab ? 'auto' : 'none'
                        }}
                      >
                        {tabStages.length > 0 ? (
                          <LayoutGroup>
                          <div className="flex flex-col gap-3 pb-16">
                            {tabStages.map((item, stageIdx) => {
                              const stage = item.stage || item
                              const activeTab = tabs.find(t => t.id === tab.id)
                              const isActiveStage = stage.id === activeTab?.activeStageId
                              const staggerOffset = tabStages
                                .slice(0, stageIdx)
                                .reduce((sum, s) => sum + ((s.stage || s).entities?.length || 0), 0)

                              return (
                                <EntityGroup
                                  key={stage.id}
                                  stage={stage}
                                  entities={stage.entities || []}
                                  isFocused={isActiveStage}
                                  focusedEntityId={focusedEntity}
                                  onClick={onEntityClick}
                                  onClose={onEntityClose}
                                  onSplit={(entityId) => onEntitySplit(entityId, stage.id)}
                                  tabs={tabs}
                                  activeTabId={tab.id}
                                  onMoveToTab={onMoveToTab}
                                  onMoveToNewTab={onMoveToNewTab}
                                  onReorderInStage={onReorderInStage}
                                  onJoinStage={onJoinStage}
                                  onCreateStageAtPosition={onCreateStageAtPosition}
                                  staggerOffset={staggerOffset}
                                  stageIndex={stageIdx}
                                  totalStages={tabStages.length}
                                />
                              )
                            })}
                          </div>
                          </LayoutGroup>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Icon strip - slide up from bottom to enter, slide down to exit */}
        <AnimatePresence>
          {sidebarShowIcons && (
            <motion.div
              key="icons"
              className="absolute inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1.5 pt-1"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: ICONS_DURATION / 1000, ease: 'easeInOut' }}
            >
              {activeEntities.map((entity) => {
                const entityColor = entity.type === 'god'
                  ? (godColors[entity.name?.toLowerCase()] || entity.color || '#888')
                  : (entity.color || '#888')
                return (
                  <motion.button
                    key={entity.id}
                    onClick={() => onEntityClick(entity.id)}
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg cursor-pointer transition-all hover:bg-white/10"
                    style={{
                      backgroundColor: entity.id === effectiveFocusedEntity ? `${entityColor}33` : 'transparent',
                      border: `2px solid ${entity.id === effectiveFocusedEntity ? entityColor : 'transparent'}`
                    }}
                    title={entity.displayName || entity.name}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <EntityIcon type={entity.type} />
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

      </TileUngroupDropZone>
    </motion.div>
  )
}
