// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  AttachedProperty
} from 'phosphor/lib/core/properties';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  JupyterLab, JupyterLabPlugin
} from '../application';

import {
  ICommandPalette
} from '../commandpalette';

import {
  InstanceTracker
} from '../common/instancetracker';

import {
  IConsoleTracker
} from '../console';

import {
  IInstanceRestorer
} from '../instancerestorer';

import {
  INotebookTracker, NotebookPanel
} from '../notebook';

import {
  InspectorManager
} from './manager';

import {
  CommandIDs, IInspector, Inspector, InspectionHandler
} from './';


/**
 * The inspector manager instance.
 */
const manager = new InspectorManager();

/**
 * The inspector instance tracker.
 */
const tracker = new InstanceTracker<Inspector>({ namespace: 'inspector' });

/**
 * A service providing code introspection.
 */
const service: JupyterLabPlugin<IInspector> = {
  id: 'jupyter.services.inspector',
  requires: [ICommandPalette, IInstanceRestorer],
  provides: IInspector,
  autoStart: true,
  activate: (app: JupyterLab, palette: ICommandPalette, restorer: IInstanceRestorer): IInspector => {
    const category = 'Inspector';
    const command = CommandIDs.open;
    const label = 'Open Inspector';

    /**
     * Create and track a new inspector.
     */
    function newInspector(): Inspector {
      let inspector = new Inspector({ items: Private.defaultInspectorItems });
      inspector.id = 'jp-inspector';
      inspector.title.label = 'Inspector';
      inspector.title.closable = true;
      inspector.disposed.connect(() => {
        if (manager.inspector === inspector) {
          manager.inspector = null;
        }
      });
      tracker.add(inspector);
      return inspector;
    }

    // Handle state restoration.
    restorer.restore(tracker, {
      command,
      args: () => null,
      name: () => 'inspector'
    });

    // Add command to registry and palette.
    app.commands.addCommand(command, {
      label,
      execute: () => {
        if (!manager.inspector || manager.inspector.isDisposed) {
          manager.inspector = newInspector();
          app.shell.addToMainArea(manager.inspector);
        }
        if (manager.inspector.isAttached) {
          app.shell.activateMain(manager.inspector.id);
        }
      }
    });
    palette.addItem({ command, category });

    return manager;
  }
};

/**
 * An extension that registers consoles for inspection.
 */
const consolePlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.console-inspector',
  requires: [IConsoleTracker],
  provides: IInspector,
  autoStart: true,
  activate: (app: JupyterLab, consoles: IConsoleTracker): void => {
    // Create a handler for each console that is created.
    consoles.widgetAdded.connect((sender, parent) => {
      const session = parent.console.session;
      const kernel = session.kernel;
      const rendermime = parent.console.rendermime;
      const handler = new InspectionHandler({ kernel, parent, rendermime });
      // Associate the handler to the widget.
      Private.handlers.set(parent, handler);
      // Set the initial editor.
      let cell = parent.console.prompt;
      handler.editor = cell && cell.editor;
      // Listen for prompt creation.
      parent.console.promptCreated.connect((sender, cell) => {
        handler.editor = cell && cell.editor;
      });
      // Listen for kernel changes.
      session.kernelChanged.connect((sender, kernel) => {
        handler.kernel = kernel;
      });
    });
    // Keep track of console instances and set inspector source.
    app.shell.currentChanged.connect((sender, args) => {
      let widget = args.newValue;
      if (!widget || !consoles.has(widget)) {
        return;
      }
      let source = Private.handlers.get(widget);
      if (source) {
        manager.source = source;
      }
    });
  }
};

/**
 * An extension that registers notebooks for inspection.
 */
const notebookPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.notebook-inspector',
  requires: [INotebookTracker],
  provides: IInspector,
  autoStart: true,
  activate: (app: JupyterLab, notebooks: INotebookTracker): void => {
    // Create a handler for each notebook that is created.
    notebooks.widgetAdded.connect((sender, parent) => {
      const kernel = parent.kernel;
      const rendermime = parent.rendermime;
      const handler = new InspectionHandler({ kernel, parent, rendermime });
      // Associate the handler to the widget.
      Private.handlers.set(parent, handler);
      // Set the initial editor.
      let cell = parent.notebook.activeCell;
      handler.editor = cell && cell.editor;
      // Listen for active cell changes.
      parent.notebook.activeCellChanged.connect((sender, cell) => {
        handler.editor = cell && cell.editor;
      });
      // Listen for kernel changes.
      parent.kernelChanged.connect((sender, kernel) => {
        handler.kernel = kernel;
      });
    });
    // Keep track of notebook instances and set inspector source.
    app.shell.currentChanged.connect((sender, args) => {
      let widget = args.newValue;
      if (!widget || !notebooks.has(widget)) {
        return;
      }
      let source = Private.handlers.get(widget);
      if (source) {
        manager.source = source;
      }
    });
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [
  service, consolePlugin, notebookPlugin
];
export default plugins;


/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * The default set of inspector items added to the inspector panel.
   */
  export
  const defaultInspectorItems: Inspector.IInspectorItem[] = [
    {
      className: 'jp-HintsInspectorItem',
      name: 'Hints',
      rank: 20,
      type: 'hints'
    }
  ];

  /**
   * A property that associates inspection handlers with their referent widgets.
   */
  export
  const handlers = new AttachedProperty<Widget, InspectionHandler>({
    name: 'handler'
  });
}
