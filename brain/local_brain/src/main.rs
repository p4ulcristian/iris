use copypasta::{ClipboardContext, ClipboardProvider};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Terminal,
};
use std::io;

struct Message {
    author: String,
    content: String,
    timestamp: String,
}

struct App {
    messages: Vec<Message>,
    input: String,
    list_state: ListState,
}

impl App {
    fn new() -> App {
        let mut app = App {
            messages: vec![
                Message {
                    author: "System".to_string(),
                    content: "Welcome to Rust Chat TUI!".to_string(),
                    timestamp: "00:00".to_string(),
                },
                Message {
                    author: "System".to_string(),
                    content: "Press 'y' or Ctrl+C to copy focused message".to_string(),
                    timestamp: "00:00".to_string(),
                },
                Message {
                    author: "System".to_string(),
                    content: "Press 'q' or Ctrl+D to quit".to_string(),
                    timestamp: "00:00".to_string(),
                },
                Message {
                    author: "Alice".to_string(),
                    content: "Hey! This is a sample message.".to_string(),
                    timestamp: "00:01".to_string(),
                },
                Message {
                    author: "Bob".to_string(),
                    content: "Navigate with arrow keys and copy with 'y'".to_string(),
                    timestamp: "00:02".to_string(),
                },
            ],
            input: String::new(),
            list_state: ListState::default(),
        };
        app.list_state.select(Some(0));
        app
    }

    fn next(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i >= self.messages.len() - 1 {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn previous(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.messages.len() - 1
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn copy_selected(&self) {
        if let Some(i) = self.list_state.selected() {
            if let Some(msg) = self.messages.get(i) {
                let text = format!("[{}] {}: {}", msg.timestamp, msg.author, msg.content);
                if let Ok(mut ctx) = ClipboardContext::new() {
                    let _ = ctx.set_contents(text);
                }
            }
        }
    }

    fn add_message(&mut self, author: String, content: String) {
        use std::time::SystemTime;
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let timestamp = format!("{:02}:{:02}", (now / 60) % 60, now % 60);

        self.messages.push(Message {
            author,
            content,
            timestamp,
        });
        self.list_state.select(Some(self.messages.len() - 1));
    }

    fn submit_input(&mut self) {
        if !self.input.is_empty() {
            let content = self.input.clone();
            self.add_message("You".to_string(), content.clone());
            self.input.clear();

            // Echo response
            self.add_message("Bot".to_string(), format!("Echo: {}", content));
        }
    }
}

fn main() -> Result<(), io::Error> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app
    let mut app = App::new();
    let res = run_app(&mut terminal, &mut app);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("{:?}", err)
    }

    Ok(())
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    app: &mut App,
) -> io::Result<()> {
    loop {
        terminal.draw(|f| {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Min(5),
                    Constraint::Length(3),
                ])
                .split(f.area());

            // Messages list
            let messages: Vec<ListItem> = app
                .messages
                .iter()
                .enumerate()
                .map(|(i, m)| {
                    let is_selected = app.list_state.selected() == Some(i);
                    let style = if is_selected {
                        Style::default()
                            .fg(Color::Green)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    };

                    let content = vec![Line::from(vec![
                        Span::styled(
                            format!("{} [{}] ", m.author, m.timestamp),
                            style.fg(Color::Cyan),
                        ),
                        Span::styled(&m.content, style),
                    ])];
                    ListItem::new(content).style(style)
                })
                .collect();

            let messages_list = List::new(messages)
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title("Messages (↑/↓ to navigate, 'y' to copy, 'q' to quit)"),
                )
                .highlight_style(
                    Style::default()
                        .bg(Color::DarkGray)
                        .add_modifier(Modifier::BOLD),
                );

            f.render_stateful_widget(messages_list, chunks[0], &mut app.list_state);

            // Input field
            let input = Paragraph::new(app.input.as_str())
                .style(Style::default().fg(Color::Yellow))
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title("Type a message (Enter to send)"),
                );
            f.render_widget(input, chunks[1]);
        })?;

        if let Event::Key(key) = event::read()? {
            match key.code {
                KeyCode::Char('q') => return Ok(()),
                KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    return Ok(())
                }
                KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    app.copy_selected();
                }
                KeyCode::Char('y') => {
                    app.copy_selected();
                }
                KeyCode::Down => app.next(),
                KeyCode::Up => app.previous(),
                KeyCode::Enter => app.submit_input(),
                KeyCode::Char(c) => app.input.push(c),
                KeyCode::Backspace => {
                    app.input.pop();
                }
                _ => {}
            }
        }
    }
}
