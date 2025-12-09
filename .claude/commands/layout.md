# Iris Layout Management

Change the tmux pane layout. Usage: `/layout [style]`

**Arguments provided:** $ARGUMENTS

## Layouts

Based on the arguments, apply ONE of these layouts:

### `main` or `default` or empty
Master pane large on the left, workers stacked vertically on the right.

```bash
tmux select-layout -t iris main-vertical
```

Then resize master to take ~60% of width:
```bash
tmux resize-pane -t iris:0.0 -x 60%
```

Say "Layout set to main view"

### `even` or `equal`
All panes evenly distributed horizontally.

```bash
tmux select-layout -t iris even-horizontal
```

Say "Layout set to even horizontal"

### `tiled` or `grid`
Grid layout - good for 4+ workers.

```bash
tmux select-layout -t iris tiled
```

Say "Layout set to tiled grid"

### `stacked`
Master on top, workers in a row below.

```bash
tmux select-layout -t iris main-horizontal
```

Then resize master to take ~60% of height:
```bash
tmux resize-pane -t iris:0.0 -y 60%
```

Say "Layout set to stacked view"

### `focus`
Maximize master pane, minimize workers.

```bash
tmux select-layout -t iris main-vertical
tmux resize-pane -t iris:0.0 -x 80%
```

Say "Layout set to focus mode"

## Important

- Always use `./say.sh` to speak confirmations
- Master is always pane 0
