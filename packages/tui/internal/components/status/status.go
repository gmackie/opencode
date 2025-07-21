package status

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea/v2"
	"github.com/charmbracelet/lipgloss/v2"
	"github.com/charmbracelet/lipgloss/v2/compat"
	opencode "github.com/sst/opencode-sdk-go"
	"github.com/sst/opencode/internal/app"
	"github.com/sst/opencode/internal/commands"
	"github.com/sst/opencode/internal/styles"
	"github.com/sst/opencode/internal/theme"
)

type StatusComponent interface {
	tea.Model
	tea.ViewModel
}

type statusComponent struct {
	app       *app.App
	width     int
	cwd       string
	totalCost float64
}

func (m *statusComponent) Init() tea.Cmd {
	m.totalCost = m.calculateTotalCost()
	return nil
}

func (m *statusComponent) calculateTotalCost() float64 {
	var sum float64
	for i, msg := range m.app.Messages {
		if ass, ok := msg.Info.(opencode.AssistantMessage); ok {
			sum += ass.Cost
			if i == len(m.app.Messages)-1 && ass.Time.Completed == 0 {
				var textLen int
				for _, part := range msg.Parts {
					if text, ok := part.(opencode.TextPart); ok {
						textLen += len(text.Text)
					}
				}
				estimatedTokens := float64(textLen) / 4
				estimatedCost := estimatedTokens * m.app.Model.Cost.Output / 1000000
				sum += estimatedCost
			}
		}
	}
	return sum
}

func (m *statusComponent) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case opencode.EventListResponseEventMessagePartUpdated,
		opencode.EventListResponseEventMessageUpdated:
		m.totalCost = m.calculateTotalCost()
	case tea.WindowSizeMsg:
		m.width = msg.Width
	}
	return m, nil
}

func (m statusComponent) logo() string {
	t := theme.CurrentTheme()
	base := styles.NewStyle().Foreground(t.TextMuted()).Background(t.BackgroundElement()).Render
	emphasis := styles.NewStyle().
		Foreground(t.Text()).
		Background(t.BackgroundElement()).
		Bold(true).
		Render

	open := base("open")
	code := emphasis("code ")
	version := base(m.app.Version)
	return styles.NewStyle().
		Background(t.BackgroundElement()).
		Padding(0, 1).
		Render(open + code + version)
}

func (m *statusComponent) View() string {
	t := theme.CurrentTheme()
	logo := m.logo()

	cwd := styles.NewStyle().
		Foreground(t.TextMuted()).
		Background(t.BackgroundPanel()).
		Padding(0, 1).
		Render(m.cwd)

	var modeBackground compat.AdaptiveColor
	var modeForeground compat.AdaptiveColor
	switch m.app.ModeIndex {
	case 0:
		modeBackground = t.BackgroundElement()
		modeForeground = t.TextMuted()
	case 1:
		modeBackground = t.Secondary()
		modeForeground = t.BackgroundPanel()
	case 2:
		modeBackground = t.Accent()
		modeForeground = t.BackgroundPanel()
	case 3:
		modeBackground = t.Success()
		modeForeground = t.BackgroundPanel()
	case 4:
		modeBackground = t.Warning()
		modeForeground = t.BackgroundPanel()
	case 5:
		modeBackground = t.Primary()
		modeForeground = t.BackgroundPanel()
	case 6:
		modeBackground = t.Error()
		modeForeground = t.BackgroundPanel()
	default:
		modeBackground = t.Secondary()
		modeForeground = t.BackgroundPanel()
	}

	command := m.app.Commands[commands.SwitchModeCommand]
	kb := command.Keybindings[0]
	key := kb.Key
	if kb.RequiresLeader {
		key = m.app.Config.Keybinds.Leader + " " + kb.Key
	}

	modeStyle := styles.NewStyle().Background(modeBackground).Foreground(modeForeground)
	modeNameStyle := modeStyle.Bold(true).Render
	modeDescStyle := modeStyle.Render
	mode := modeNameStyle(strings.ToUpper(m.app.Mode.Name)) + modeDescStyle(" MODE")
	mode = modeStyle.
		Padding(0, 1).
		BorderLeft(true).
		BorderStyle(lipgloss.ThickBorder()).
		BorderForeground(modeBackground).
		BorderBackground(t.BackgroundPanel()).
		Render(mode)

	mode = styles.NewStyle().
		Faint(true).
		Background(t.BackgroundPanel()).
		Foreground(t.TextMuted()).
		Render(key+" ") +
		mode

	space := max(
		0,
		m.width-lipgloss.Width(logo)-lipgloss.Width(cwd)-lipgloss.Width(mode),
	)
	spacer := styles.NewStyle().Background(t.BackgroundPanel()).Width(space).Render("")

	usage := styles.NewStyle().
		Foreground(t.TextMuted()).
		Background(t.BackgroundPanel()).
		Padding(0, 1).
		Render(fmt.Sprintf("$%.4f", m.totalCost))
	space = max(
		0,
		m.width-lipgloss.Width(logo)-lipgloss.Width(cwd)-lipgloss.Width(usage)-lipgloss.Width(mode),
	)
	spacer = styles.NewStyle().Background(t.BackgroundPanel()).Width(space).Render("")
	status := logo + cwd + usage + spacer + mode

	blank := styles.NewStyle().Background(t.Background()).Width(m.width).Render("")
	return blank + "\n" + status
}

func NewStatusCmp(app *app.App) StatusComponent {
	statusComponent := &statusComponent{
		app: app,
	}

	homePath, err := os.UserHomeDir()
	cwdPath := app.Info.Path.Cwd
	if err == nil && homePath != "" && strings.HasPrefix(cwdPath, homePath) {
		cwdPath = "~" + cwdPath[len(homePath):]
	}
	statusComponent.cwd = cwdPath

	return statusComponent
}
