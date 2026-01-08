/**
 * Styled text input.
 * @param {Object} props
 * @param {string} [props.value] - Input value
 * @param {Function} [props.onChange] - Change handler
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.type] - Input type
 * @param {boolean} [props.disabled] - Disabled state
 * @param {string} [props.className] - Additional classes
 */
export default function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`
        w-full px-3 py-2 text-sm
        bg-black/30 border border-white/10 rounded-lg
        focus:outline-none focus:border-accent/50
        text-text-primary placeholder:text-text-tertiary
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
        ${className}
      `}
      {...props}
    />
  )
}
