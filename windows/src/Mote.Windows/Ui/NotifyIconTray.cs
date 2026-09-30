using System.Drawing;
using WinForms = System.Windows.Forms;

namespace Mote.Windows.Ui;

public sealed class NotifyIconTray : ITraySurface
{
    private readonly WinForms.NotifyIcon _icon;
    private readonly WinForms.ContextMenuStrip _menu;
    private readonly WinForms.ToolStripMenuItem _status;
    private readonly WinForms.ToolStripMenuItem _toggle;
    private readonly Icon? _ownedIcon;
    private TrayMenuModel _model = TrayMenuModel.Initial;
    private bool _disposed;

    public NotifyIconTray()
    {
        _status = new WinForms.ToolStripMenuItem("Mote") { Enabled = false };
        var open = new WinForms.ToolStripMenuItem("Open Mote");
        _toggle = new WinForms.ToolStripMenuItem("Connect");
        var quit = new WinForms.ToolStripMenuItem("Quit Mote");
        open.Click += (_, _) => OpenRequested?.Invoke(this, EventArgs.Empty);
        _toggle.Click += (_, _) =>
        {
            if (_model.OffersDisconnect)
            {
                DisconnectRequested?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                ConnectRequested?.Invoke(this, EventArgs.Empty);
            }
        };
        quit.Click += (_, _) => QuitRequested?.Invoke(this, EventArgs.Empty);

        _menu = new WinForms.ContextMenuStrip();
        _menu.Items.Add(_status);
        _menu.Items.Add(new WinForms.ToolStripSeparator());
        _menu.Items.Add(open);
        _menu.Items.Add(_toggle);
        _menu.Items.Add(new WinForms.ToolStripSeparator());
        _menu.Items.Add(quit);

        _ownedIcon = LoadIcon();
        _icon = new WinForms.NotifyIcon
        {
            Icon = _ownedIcon ?? SystemIcons.Application,
            Visible = true,
            Text = "Mote",
            ContextMenuStrip = _menu,
        };
        _icon.DoubleClick += (_, _) => OpenRequested?.Invoke(this, EventArgs.Empty);
    }

    public bool IsDisposed => _disposed;

    public event EventHandler? OpenRequested;

    public event EventHandler? ConnectRequested;

    public event EventHandler? DisconnectRequested;

    public event EventHandler? QuitRequested;

    public void Apply(TrayMenuModel model)
    {
        if (_disposed)
        {
            return;
        }

        _model = model;
        _status.Text = model.StatusText;
        _toggle.Text = model.ToggleText;
        _toggle.Enabled = model.ToggleEnabled;
        var tooltip = model.Tooltip;
        if (tooltip.Length > 63)
        {
            tooltip = tooltip[..63];
        }

        _icon.Text = tooltip;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _icon.Visible = false;
        _icon.Dispose();
        _menu.Dispose();
        _ownedIcon?.Dispose();
    }

    private static Icon? LoadIcon()
    {
        try
        {
            var path = Environment.ProcessPath;
            if (string.IsNullOrEmpty(path))
            {
                return null;
            }

            return Icon.ExtractAssociatedIcon(path);
        }
        catch (Exception)
        {
            return null;
        }
    }
}
