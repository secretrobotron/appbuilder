(function () {
  
  document.addEventListener('DOMContentLoaded', function (e) {
    var sandboxToolbar = document.querySelector('#sandbox-toolbar');
    var componentToolbar = sandboxToolbar.querySelector('#component-toolbar');
    var componentToolbarItemTemplate = componentToolbar.querySelector('.component-toolbar-item');
    var phoneContainerArea = document.querySelector('#phone-container');

    componentToolbarItemTemplate.parentNode.removeChild(componentToolbarItemTemplate);

    var modeSwitchFunctions = {
      connect: function () {
        appbuilder.enableGraphMouseEvents();
      },
      layout: function () {
        appbuilder.disableGraphMouseEvents();
      }
    };

    Array.prototype.forEach.call(sandboxToolbar.querySelectorAll('input[name="mode"]'), function (inputElement) {
      inputElement.addEventListener('change', function (e) {
        if (inputElement.checked) {
          modeSwitchFunctions[inputElement.value]();
        }
      }, false);
    });

    $(phoneContainerArea).gridster({
      widget_margins: [10, 10],
      widget_base_dimensions: [50, 50],
      extra_cols: 5,
      extra_rows: 8,
      avoid_overlapped_widgets: true
    });

    var gridster = $(phoneContainerArea).gridster().data('gridster');

    appbuilder.environment.getComponents(function (list) {
      var newTags = [];
      var instances = [];

      list.forEach(function (definition) {
        var componentListItem = componentToolbarItemTemplate.cloneNode(true);
        var componentInstance = document.createElement(definition.name);
        componentListItem.appendChild(componentInstance);
        componentToolbar.appendChild(componentListItem);

        componentInstance.setAttribute('data-thumbnail-only', true);
        componentInstance._definition = definition;

        var linkTag = document.createElement('link');
        linkTag.rel = 'import';
        linkTag.href = definition.url;
        document.head.appendChild(linkTag);
        
        instances.push(componentInstance);
        newTags.push(linkTag);
      });
      
      // FORCE CustomElements to reparse :/ hack hack hack hack hack        
      HTMLImports.importer.loader(function () {
        document.__importParsed = false;
        document.__parsed = false;
        HTMLImports.parser.parse(document);
        CustomElements.parser.parse(document);

        var currentDraggingElement;

        instances.forEach(function (instance) {
          $(instance).draggable({
            helper: 'clone',
            start: function (e, ui) {
              var rect = instance.getBoundingClientRect();
              ui.helper[0].style.width = rect.width + 'px';
              ui.helper[0].style.height = rect.height + 'px';
              currentDraggingElement = instance;
            },
            cancel: false
          });
        });

        $(phoneContainerArea).droppable({
          activeClass: 'droppable-over',
          drop: function (e, ui) {
            if (currentDraggingElement) {
              var definition = currentDraggingElement._definition;
              var sizeX = 1, sizeY = 1;
              if (definition.dimensions) {
                sizeX = Math.ceil(definition.dimensions.width / 50);
                sizeY = Math.ceil(definition.dimensions.height / 50);
              }
              gridster.add_widget('<' + currentDraggingElement.localName + '></' + currentDraggingElement.localName + '>', sizeX, sizeY);
            }
          }
        });

      }).addNodes(newTags);

    });

    window.addEventListener('appbuilderloaded', function (e) {
      modeSwitchFunctions['layout']();
    }, false);
  }, false);

})();