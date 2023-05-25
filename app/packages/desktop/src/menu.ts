/* eslint @typescript-eslint/ban-ts-ignore: off */
import {
  app,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
} from "electron";

interface DarwinMenuItemConstructorOptions extends MenuItemConstructorOptions {
  selector?: string;
  submenu?: DarwinMenuItemConstructorOptions[] | Menu;
}

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu() {
    if (process.env.DEBUG_APP === "true") {
      this.setupDevelopmentEnvironment();
    }

    const template =
      process.platform === "darwin"
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  setupDevelopmentEnvironment() {
    this.mainWindow.webContents.on("context-menu", (_, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: "Inspect element",
          click: () => {
            this.mainWindow.webContents.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });
    });
  }

  buildDarwinTemplate() {
    const subMenuAbout: DarwinMenuItemConstructorOptions = {
      label: "FiftyOne",
      submenu: [
        {
          label: "About FiftyOne",
          selector: "orderFrontStandardAboutPanel:",
        },
        { type: "separator" },
        { label: "Services", submenu: [] },
        { type: "separator" },
        {
          label: "Hide FiftyOne",
          accelerator: "Command+H",
          selector: "hide:",
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          selector: "hideOtherApplications:",
        },
        { label: "Show All", selector: "unhideAllApplications:" },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit: DarwinMenuItemConstructorOptions = {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "Command+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+Command+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "Command+X", selector: "cut:" },
        { label: "Copy", accelerator: "Command+C", selector: "copy:" },
        { label: "Paste", accelerator: "Command+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "Command+A",
          selector: "selectAll:",
        },
      ],
    };
    const subMenuViewDev: MenuItemConstructorOptions = {
      label: "View",
      submenu: [
        {
          label: "Remote Session",
          accelerator: "Ctrl+Command+R",
          click: () => {},
        },
        {
          label: "Reload",
          accelerator: "Command+R",
          click: () => {
            this.mainWindow.webContents.reload();
          },
        },
        {
          label: "Toggle Full Screen",
          accelerator: "Ctrl+Command+F",
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: "Alt+Command+I",
          click: () => {
            this.mainWindow.webContents.toggleDevTools();
          },
        },
      ],
    };
    const subMenuViewProd: MenuItemConstructorOptions = {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: "Ctrl+Command+F",
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
      ],
    };
    const subMenuWindow: DarwinMenuItemConstructorOptions = {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "Command+M",
          selector: "performMiniaturize:",
        },
        { label: "Close", accelerator: "Command+W", selector: "performClose:" },
        { type: "separator" },
        { label: "Bring All to Front", selector: "arrangeInFront:" },
      ],
    };
    const subMenuSettings: MenuItemConstructorOptions = {
      label: "Settings",
      submenu: [
        {
          label: "Port number",
          accelerator: "Ctrl+Shift+R",
          click: () => {
            this.mainWindow.webContents.send("update-session-config", "...");
          },
        },
      ],
    };
    const subMenuHelp: MenuItemConstructorOptions = {
      label: "Help",
      submenu: [
        {
          label: "Email",
          click() {
            shell.openExternal("mailto:support@voxel51.com");
          },
        },
        {
          label: "Documentation",
          click() {
            shell.openExternal("https://docs.voxel51.com");
          },
        },
        {
          label: "Slack",
          click() {
            shell.openExternal("https://slack.voxel51.com");
          },
        },
      ],
    };

    const subMenuView =
      process.env.DEBUG_APP === "true" ? subMenuViewDev : subMenuViewProd;

    return [
      subMenuAbout,
      subMenuEdit,
      subMenuView,
      subMenuWindow,
      subMenuSettings,
      subMenuHelp,
    ];
  }

  buildDefaultTemplate() {
    const templateDefault = [
      {
        label: "&File",
        submenu: [
          {
            label: "&Close",
            accelerator: "Ctrl+W",
            click: () => {
              this.mainWindow.close();
            },
          },
        ],
      },
      {
        label: "&View",
        submenu:
          process.env.DEBUG_APP === "true"
            ? [
                {
                  label: "&Reload",
                  accelerator: "Ctrl+R",
                  click: () => {
                    this.mainWindow.webContents.reload();
                  },
                },
                {
                  label: "Toggle &Full Screen",
                  accelerator: "F11",
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  },
                },
                {
                  label: "Toggle &Developer Tools",
                  accelerator: "Alt+Ctrl+I",
                  click: () => {
                    this.mainWindow.webContents.toggleDevTools();
                  },
                },
              ]
            : [
                {
                  label: "Toggle &Full Screen",
                  accelerator: "F11",
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  },
                },
              ],
      },
      {
        label: "Settings",
        submenu: [
          {
            label: "Port number",
            accelerator: "Ctrl+Shift+R",
            click: () => {
              this.mainWindow.webContents.send("update-session-config", "...");
            },
          },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Email",
            click() {
              shell.openExternal("mailto:support@voxel51.com");
            },
          },
          {
            label: "Documentation",
            click() {
              shell.openExternal("https://docs.voxel51.com");
            },
          },
          {
            label: "Slack",
            click() {
              shell.openExternal("https://slack.voxel51.com");
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}
