// ==UserScript==
// @name         Planter Pot Selection Keeper
// @namespace    https://magicgarden.gg/
// @version      1.0.0
// @description  Keeps the Planter Pot selected after manually potting a plant.
// @author       Liam
// @match        https://magicgarden.gg/*
// @match        https://magiccircle.gg/*
// @match        https://starweaver.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
    'use strict';
    const gameWindow = window;
    const wrappedAtoms = new WeakSet();
    let pendingSelection = null;
    function getAtomMap() {
        const cache = gameWindow.jotaiAtomCache;
        if (cache instanceof Map)
            return cache;
        return cache?.cache instanceof Map ? cache.cache : null;
    }
    function findAtom(map, debugLabel) {
        for (const atom of map.values()) {
            if (atom?.debugLabel === debugLabel)
                return atom;
        }
        return null;
    }
    function planterPotCount(items) {
        return items.reduce((total, item) => {
            if (item?.itemType !== 'Tool' || item.toolId !== 'PlanterPot')
                return total;
            return total + (typeof item.quantity === 'number' ? item.quantity : 1);
        }, 0);
    }
    function plantIds(items) {
        return new Set(items
            .filter(item => item?.itemType === 'Plant' && typeof item.id === 'string')
            .map(item => item.id));
    }
    function hasItemId(items, itemId) {
        return items.some(item => {
            if (item?.itemType === 'Tool')
                return item.toolId === itemId;
            return item?.id === itemId;
        });
    }
    function installHooks() {
        const map = getAtomMap();
        if (!map)
            return false;
        const inventoryAtom = findAtom(map, 'myOptimisticInventoryItemsAtom');
        const selectedItemAtom = findAtom(map, 'mySelectedItemIdAtom');
        if (!inventoryAtom?.write || !selectedItemAtom?.write)
            return false;
        if (wrappedAtoms.has(inventoryAtom) || wrappedAtoms.has(selectedItemAtom))
            return true;
        const originalInventoryWrite = inventoryAtom.write;
        const originalSelectedItemWrite = selectedItemAtom.write;
        inventoryAtom.write = function (get, set, ...args) {
            const previousItems = get(inventoryAtom);
            const nextItems = args[0];
            if (Array.isArray(previousItems) && Array.isArray(nextItems)) {
                const selectedItemId = get(selectedItemAtom);
                const previousPotCount = planterPotCount(previousItems);
                const nextPotCount = planterPotCount(nextItems);
                if (selectedItemId === 'PlanterPot' && previousPotCount - nextPotCount === 1) {
                    const previousPlantIds = plantIds(previousItems);
                    const addedPlantIds = new Set([...plantIds(nextItems)].filter(id => !previousPlantIds.has(id)));
                    if (addedPlantIds.size > 0) {
                        pendingSelection = {
                            addedPlantIds,
                            restoreItemId: hasItemId(nextItems, 'PlanterPot') ? 'PlanterPot' : null,
                            expiresAt: performance.now() + 2000,
                        };
                    }
                }
            }
            return originalInventoryWrite.call(this, get, set, ...args);
        };
        selectedItemAtom.write = function (get, set, ...args) {
            const nextItemId = args[0];
            const pending = pendingSelection;
            if (pending && performance.now() <= pending.expiresAt) {
                pendingSelection = null;
                if (typeof nextItemId === 'string' && pending.addedPlantIds.has(nextItemId)) {
                    return originalSelectedItemWrite.call(this, get, set, pending.restoreItemId);
                }
            }
            else if (pending) {
                pendingSelection = null;
            }
            return originalSelectedItemWrite.call(this, get, set, ...args);
        };
        wrappedAtoms.add(inventoryAtom);
        wrappedAtoms.add(selectedItemAtom);
        console.info('[Planter Pot Selection Keeper] Ready');
        return true;
    }
    const installTimer = window.setInterval(() => {
        if (installHooks())
            window.clearInterval(installTimer);
    }, 250);
    installHooks();
})();
