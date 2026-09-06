/**
 * DFlip Bookmark Viewer Class
 */

export class BookMarkViewer {
  constructor(options) {
    this.outline = null;
    this.lastToggleIsShow = true;
    this.container = options.container;
    this.linkService = options.linkService;
    this.outlineItemClass = options.outlineItemClass || "outlineItem";
    this.outlineToggleClass = options.outlineToggleClass || "outlineItemToggler";
    this.outlineToggleHiddenClass = options.outlineToggleHiddenClass || "outlineItemsHidden";
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.linkService = null;
  }

  reset() {
    this.outline = null;
    this.lastToggleIsShow = true;
    const container = this.container;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  _dispatchEvent(count) {
    const event = document.createEvent("CustomEvent");
    event.initCustomEvent("outlineloaded", true, true, { outlineCount: count });
    this.container.dispatchEvent(event);
  }

  _bindLink(element, item) {
    const linkService = this.linkService;
    if (item.custom == true) {
      element.href = linkService.getCustomDestinationHash(item.dest);
      element.onclick = (e) => {
        linkService.customNavigateTo(item.dest);
        return false;
      };
    } else {
      if (item.url) {
        pdfjsLib.addLinkAttributes(element, { url: item.url });
        return;
      }
      element.href = linkService.getDestinationHash(item.dest);
      element.onclick = (e) => {
        linkService.navigateTo(item.dest);
        return false;
      };
    }
  }

  _addToggleButton(element) {
    const toggle = document.createElement("div");
    toggle.className = this.outlineToggleClass + " " + this.outlineToggleHiddenClass;
    toggle.onclick = (e) => {
      e.stopPropagation();
      toggle.classList.toggle(this.outlineToggleHiddenClass);
      if (e.shiftKey) {
        const isShown = !toggle.classList.contains(this.outlineToggleHiddenClass);
        this._toggleOutlineItem(element, isShown);
      }
    };
    element.insertBefore(toggle, element.firstChild);
  }

  _toggleOutlineItem(element, isShown) {
    this.lastToggleIsShow = isShown;
    const togglers = element.querySelectorAll("." + this.outlineToggleClass);
    for (let i = 0; i < togglers.length; i++) {
      togglers[i].classList[isShown ? "remove" : "add"](this.outlineToggleHiddenClass);
    }
  }

  toggleOutlineTree() {
    if (!this.outline) return;
    this._toggleOutlineItem(this.container, !this.lastToggleIsShow);
  }

  render(options) {
    const outline = (options && options.outline) || null;
    let count = 0;
    if (this.outline) {
      this.reset();
    }
    this.outline = outline;
    if (!outline) return;

    const fragment = document.createDocumentFragment();
    const stack = [{ parent: fragment, items: this.outline }];
    let hasSubItems = false;

    while (stack.length > 0) {
      const current = stack.shift();
      const isCustom = current.custom;
      for (let i = 0; i < current.items.length; i++) {
        const item = current.items[i];
        const div = document.createElement("div");
        div.className = this.outlineItemClass;
        const link = document.createElement("a");
        if (item.custom == null && isCustom != null) item.custom = isCustom;
        this._bindLink(link, item);
        link.textContent = item.title.replace(/\x00/g, "");
        div.appendChild(link);
        if (item.items && item.items.length > 0) {
          hasSubItems = true;
          this._addToggleButton(div);
          const subContainer = document.createElement("div");
          subContainer.className = this.outlineItemClass + "s";
          div.appendChild(subContainer);
          stack.push({ parent: subContainer, custom: item.custom, items: item.items });
        }
        current.parent.appendChild(div);
        count++;
      }
    }

    if (hasSubItems) {
      if (this.container.classList != null) {
        this.container.classList.add(this.outlineItemClass + "s");
      } else if (this.container.className != null) {
        this.container.className += " picWindow";
      }
    }
    this.container.appendChild(fragment);
    this._dispatchEvent(count);
  }
}
