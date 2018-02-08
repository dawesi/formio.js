import FormioForm from './formio.form';
import dragula from 'dragula';
import Components from './components/builder';
import {FormioComponents} from './components/Components';
import Promise from 'native-promise-only';
import FormioUtils from './utils';
import _ from 'lodash';

export class FormioFormBuilder extends FormioForm {
  constructor(element, options) {
    super(element, options);
    let self = this;
    this.options.builder = true;
    this.options.hooks = this.options.hooks || {};
    this.options.hooks.addComponents = function(components) {
      if (!components || !components.length) {
        // Return a simple alert so they know they can add something here.
        return [
          {
            type: 'htmlelement',
            internal: true,
            tag: 'div',
            className: 'alert alert-info',
            attrs: [
              {attr: 'id', value: this.id + '-placeholder'},
              {attr: 'style', value: 'text-align:center; margin-bottom: 0px;'},
              {attr: 'role', value: 'alert'}
            ],
            content: 'Drag and Drop a form component'
          }
        ];
      }
      return components;
    };
    this.options.hooks.addComponent = function(container, comp) {
      if (!comp || !comp.component) {
        return container;
      }

      if (!comp.noEdit && !comp.component.internal) {
        // Make sure the component position is relative so the buttons align properly.
        comp.getElement().style.position = 'relative';

        let removeButton = this.ce('div', {
          class: 'btn btn-xxs btn-danger component-settings-button component-settings-button-remove'
        }, this.ce('span', {class: 'glyphicon glyphicon-remove'}));
        this.addEventListener(removeButton, 'click', () => self.deleteComponent(comp));

        let editButton = this.ce('div', {
          class: 'btn btn-xxs btn-default component-settings-button component-settings-button-edit'
        }, this.ce('span', {class: 'glyphicon glyphicon-cog'}));
        this.addEventListener(editButton, 'click', () => self.editComponent(comp));

        // Add the edit buttons to the component.
        comp.prepend(this.ce('div', {
          class: 'component-btn-group'
        }, [removeButton, editButton]));
      }

      if (!container.noDrop && !container.dragContainer) {
        container.component = this;
        container.dragContainer = true;
        self.addClass(container, 'drag-container');
        self.dragContainers.push(container);
      }

      return container;
    };
  }

  get ready() {
    return this.formReady;
  }

  deleteComponent(component) {
    if (!component.parent) {
      return;
    }
    let remove = true;
    if (component.type === 'components' && component.getComponents().length > 0) {
      remove = window.confirm(this.t('Removing this component will also remove all of its children. Are you sure you want to do this?'));
    }
    if (remove) {
      this.emit('deleteComponent', component);
      component.parent.removeComponentById(component.id);
      this.form = this.schema;
    }
  }

  updateComponent(component, isNew) {
    // Update the preview.
    if (this.componentPreview) {
      this.componentPreview.innerHTML = '';
      this.componentPreview.appendChild(Components.create(component.component, {
        preview: true
      }).getElement());
    }

    // Ensure this component has a key.
    if (isNew) {
      if (!component.keyModified) {
        component.component.key = _.camelCase(
          component.component.label ||
          component.component.placeholder ||
          component.component.type
        );
      }

      // Set a unique key for this component.
      FormioUtils.uniquify(this._form, component.component, isNew);
    }

    // Set the full form on the component.
    component.component.__form = this.schema;

    // Modify the component information in the edit form.
    if (this.editForm) {
      this.editForm.formReady.then(() => this.editForm.setValue({data: component.component}, {
        noUpdateEvent: true
      }));
    }

    // Called when we update a component.
    component.isNew = isNew;
    this.emit('updateComponent', component);
  }

  editComponent(component, isNew) {
    let componentCopy = _.cloneDeep(component);
    let componentClass = Components[componentCopy.component.type];
    let dialog = this.createModal(componentCopy.name);
    let formioForm = this.ce('div');
    this.componentPreview = this.ce('div', {
      class: 'component-preview'
    });
    let componentInfo = componentClass ? componentClass.builderInfo : {};

    let saveButton = this.ce('button', {
      class: 'btn btn-success',
      style: 'margin-right: 10px;'
    }, this.t('Save'));

    let cancelButton = this.ce('button', {
      class: 'btn btn-default',
      style: 'margin-right: 10px;'
    }, this.t('Cancel'));

    let removeButton = this.ce('button', {
      class: 'btn btn-danger'
    }, this.t('Remove'));

    let componentEdit = this.ce('div', {

    }, [
      this.ce('div', {
        class: 'row'
      }, [
        this.ce('div', {
          class: 'col col-sm-6'
        }, this.ce('p', {
          class: 'lead'
        }, componentInfo.title + ' Component')),
        this.ce('div', {
          class: 'col col-sm-6'
        }, [
          this.ce('div', {
            class: 'pull-right',
            style: 'margin-right: 20px; margin-top: 10px'
          }, this.ce('a', {
            href: componentInfo.documentation || '#',
            target: '_blank'
          }, this.ce('i', {
            class: 'glyphicon glyphicon-new-window'
          }, ' ' + this.t('Help'))))
        ])
      ]),
      this.ce('div', {
        class: 'row'
      }, [
        this.ce('div', {
          class: 'col col-sm-6'
        }, formioForm),
        this.ce('div', {
          class: 'col col-sm-6'
        }, [
          this.ce('div', {
            class: 'panel panel-default preview-panel'
          }, [
            this.ce('div', {
              class: 'panel-heading'
            }, this.ce('h3', {
              class: 'panel-title'
            }, this.t('Preview'))),
            this.ce('div', {
              class: 'panel-body'
            }, this.componentPreview)
          ]),
          this.ce('div', {
            style: 'margin-top: 10px;'
          }, [
            saveButton,
            cancelButton,
            removeButton
          ])
        ])
      ])
    ]);

    // Append the settings page to the dialog body.
    dialog.body.appendChild(componentEdit);
    this.editForm = new FormioForm(formioForm);

    // Set the form to the edit form.
    this.editForm.form = Components[componentCopy.component.type].editForm();

    // Update the preview with this component.
    this.updateComponent(componentCopy, isNew);

    // Register for when the edit form changes.
    this.editForm.on('change', (event) => {
      if (event.changed) {
        // See if this is a manually modified key.
        if (event.changed.component && (event.changed.component.key === 'key')) {
          componentCopy.keyModified = true;
        }

        // Set the component JSON to the new data.
        componentCopy.component = event.data;

        // Update the component.
        this.updateComponent(componentCopy, isNew);
      }
    });

    this.addEventListener(cancelButton, 'click', (event) => {
      event.preventDefault();
      dialog.close();
    });

    this.addEventListener(removeButton, 'click', (event) => {
      event.preventDefault();
      this.deleteComponent(component);
      dialog.close();
    });

    this.addEventListener(saveButton, 'click', (event) => {
      event.preventDefault();
      isNew = false;
      if (componentCopy.component && componentCopy.component.__form) {
        delete componentCopy.component.__form;
      }
      component.component = componentCopy.component;
      this.emit('saveComponent', component);
      this.form = this.schema;
      dialog.close();
    });

    this.addEventListener(dialog, 'close', () => {
      this.editForm.destroy();
      if (isNew) {
        this.deleteComponent(component);
      }
    });

    // Called when we edit a component.
    this.emit('editComponent', component);
  }

  clear() {
    super.clear();
    if (this.builderElement) {
      this.builderElement.innerHTML = '';
    }
  }

  destroy() {
    super.destroy();
    if (this.dragula) {
      this.dragula.destroy();
    }
  }

  buildSidebar() {
    // Get all of the components builder info grouped and sorted.
    let components = _.map(_.assign(Components, FormioComponents.customComponents), (component, key) => {
      let builderInfo = component.builderInfo;
      if (!builderInfo) {
        return null;
      }

      builderInfo.key = key;
      return builderInfo;
    });

    components = _.sortBy(components, 'weight');
    components = _.groupBy(components, 'group');
    let sideBarElement = this.ce('div', {
      class: 'panel-group'
    });

    this.groupPanels = {};

    // Iterate through each group of components.
    let firstGroup = true;
    _.each(components, (groupComponents, group) => {
      let groupInfo = FormioComponents.groupInfo[group];
      if (groupInfo) {
        let groupAnchor = this.ce('a', {
          href: '#group-' + group
        }, this.text(groupInfo.title));
        this.addEventListener(groupAnchor, 'click', (event) => {
          event.preventDefault();
          let clickedGroup = event.target.getAttribute('href').substr(1);
          let wasIn = this.hasClass(this.groupPanels[clickedGroup], 'in');
          _.each(this.groupPanels, (groupPanel, groupId) => {
            this.removeClass(groupPanel, 'in');
            if ((groupId === clickedGroup) && !wasIn) {
              this.addClass(groupPanel, 'in');
            }
          });

          // Match the form builder height to the sidebar.
          this.formBuilderElement.style.minHeight = this.builderSidebar.offsetHeight + 'px';
        });

        let groupPanel = this.ce('div', {
          class: 'panel panel-default form-builder-panel'
        }, [
          this.ce('div', {
            class: 'panel-heading'
          }, [
            this.ce('h4', {
              class: 'panel-title'
            }, groupAnchor)
          ])
        ]);
        let groupBody = this.ce('div', {
          class: 'panel-body no-drop'
        });

        // Add this group body to the drag containers.
        this.dragContainers.push(groupBody);

        let groupBodyClass = 'panel-collapse collapse';
        if (firstGroup) {
          groupBodyClass += ' in';
          firstGroup = false;
        }
        let groupId = `group-${group}`;
        let groupBodyWrapper = this.ce('div', {
          class: groupBodyClass,
          id: groupId
        }, groupBody);

        this.groupPanels[groupId] = groupBodyWrapper;

        _.each(groupComponents, (builderInfo) => {
          let compButton = this.ce('span', {
            id: 'builder-' + builderInfo.key,
            class: 'btn btn-primary btn-xs btn-block formcomponent drag-copy'
          });
          if (builderInfo.icon) {
            compButton.appendChild(this.ce('i', {
              class: builderInfo.icon,
              style: 'margin-right: 5px;'
            }));
          }
          compButton.builderInfo = builderInfo;
          compButton.appendChild(this.text(builderInfo.title));
          groupBody.appendChild(compButton);
        });

        groupPanel.appendChild(groupBodyWrapper);
        sideBarElement.appendChild(groupPanel);
      }
    });

    return sideBarElement;
  }

  getParentElement(element) {
    let containerComponent = element;
    do { containerComponent = containerComponent.parentNode } while (containerComponent && !containerComponent.component);
    return containerComponent;
  }

  build() {
    this.dragContainers = [];
    if (!this.builderElement) {
      this.builderElement = this.element;
      this.builderElement.setAttribute('class', 'row formbuilder');
    }

    this.builderSidebar = document.createElement('div');
    this.builderSidebar.setAttribute('class', 'col-xs-4 col-sm-3 col-md-2 formcomponents');
    this.builderElement.appendChild(this.builderSidebar);

    this.formBuilderElement = document.createElement('div');
    this.formBuilderElement.setAttribute('class', 'col-xs-8 col-sm-9 col-md-10 formarea');
    this.element = this.formBuilderElement;
    this.element.component = this;

    this.builderElement.appendChild(this.formBuilderElement);
    this.sideBarElement = this.buildSidebar();
    this.builderSidebar.appendChild(this.sideBarElement);

    super.build();
    this.dragula = dragula(this.dragContainers, {
      copy: function(el, source) {
        return el.classList.contains('drag-copy');
      },
      accepts: function(el, target) {
        return !target.classList.contains('no-drop');
      }
    }).on('drop', (element, target, source, sibling) => {
      let builderElement = source.querySelector('#' + element.id);
      let newParent = this.getParentElement(element);
      if (!newParent || !newParent.component) {
        return console.warn('Could not find parent component.');
      }

      // Remove any instances of the placeholder.
      let placeholder = document.getElementById(newParent.component.id + '-placeholder');
      if (placeholder) {
        placeholder.parentNode.removeChild(placeholder);
      }

      // If the sibling is the placeholder, then set it to null.
      if (sibling === placeholder) {
        sibling = null;
      }

      // If this is a new component, it will come from the builderElement
      if (
        builderElement &&
        builderElement.builderInfo &&
        builderElement.builderInfo.schema
      ) {
        // Add the new component.
        let component = newParent.component.addComponent(
          builderElement.builderInfo.schema,
          newParent,
          newParent.component.data,
          sibling
        );

        // Edit the component.
        this.editComponent(component, true);

        // Remove the element.
        target.removeChild(element);
      }
      // Check to see if this is a moved component.
      else if (element.component) {
        // Remove the component from its parent.
        if (element.component.parent) {
          element.component.parent.removeComponent(element.component);
        }

        // Add the component to its new parent.
        newParent.component.addComponent(
          element.component.schema,
          newParent,
          newParent.component.data,
          sibling
        );

        // Refresh the form.
        this.form = this.schema;
      }
    });

    this.formReadyResolve();
  }
}