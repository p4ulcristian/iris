import { FileIcon as SymbolFileIcon } from '@react-symbols/icons/utils'

export default function FileIcon({ filename, size = 16 }) {
  return (
    <div style={{ width: size, height: size }} className="flex-shrink-0">
      <SymbolFileIcon
        fileName={filename}
        autoAssign={true}
        width={size}
        height={size}
      />
    </div>
  )
}
