// ==UserScript==
// @name         Garden Overview
// @namespace    http://tampermonkey.net/
// @version      1.41
// @description  Garden Overview popup with mutation & species tracking
// @author       Liam
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @updateURL    https://github.com/Liam0306dis/gardenoverview/raw/refs/heads/main/garden-overview.user.js
// @downloadURL  https://github.com/Liam0306dis/gardenoverview/raw/refs/heads/main/garden-overview.user.js
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    console.log('[GardenOverview] Script starting, run-at=document-start');

    // === State ===
    const state = { atoms: {} };
    const targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    console.log('[GardenOverview] unsafeWindow available:', typeof unsafeWindow !== 'undefined');
    let _keybind = null;

    // === Pet + Plant catalog capture ===
    let _asPetCatalog = null;
    let _asPlantCatalog = null;
    (function() {
        const _seen = new WeakSet();
        const _nativeKeys = Object.keys; // true native, saved before anyone touches it

        function _looksLikePetCatalog(obj, keys) {
            const common = ['Worm','Snail','Bee','Chicken','Bunny','Turkey','Goat'];
            if (common.filter(function(k) { return keys.indexOf(k) !== -1; }).length < 3) return false;
            const sample = obj[common.find(function(k) { return keys.indexOf(k) !== -1; })];
            return sample && typeof sample === 'object' && 'coinsToFullyReplenishHunger' in sample && 'diet' in sample && Array.isArray(sample.diet);
        }

        function _looksLikePlantCatalog(obj, keys) {
            const common = ['Carrot','Cabbage','Strawberry','Aloe','Beet','Rose','Clover'];
            if (common.filter(function(k) { return keys.indexOf(k) !== -1; }).length < 3) return false;
            const sample = obj[common.find(function(k) { return keys.indexOf(k) !== -1; })];
            return sample && typeof sample === 'object' && 'crop' in sample && sample.crop && 'baseSellPrice' in sample.crop;
        }

        let _restoreKeysTimer = null;
        let _keysRestored = false;
        function _restoreKeysNow(reason) {
            if (_keysRestored) return;
            _keysRestored = true;
            const finalCount = _asPlantCatalog ? _nativeKeys.call(Object, _asPlantCatalog).length : 0;
            console.log('[GardenOverview] Restoring Object.keys (' + reason + '). Final plant catalog: ' + finalCount + ' species.');
            try {
                Object.defineProperty(Object, 'keys', { value: _nativeKeys, writable: true, configurable: true });
            } catch(e) {
                console.warn('[GardenOverview] Could not restore Object.keys:', e);
            }
        }
        function _tryRestoreKeys() {
            if (!_asPetCatalog || !_asPlantCatalog) return;
            // Delay restore so a larger plant catalog can still be captured if the first was partial
            if (_restoreKeysTimer) return;
            _restoreKeysTimer = setTimeout(function() { _restoreKeysNow('both catalogs captured'); }, 5000);
        }

        function _scan(obj, depth) {
            if (!obj || typeof obj !== 'object' || _seen.has(obj)) return;
            _seen.add(obj);
            let keys;
            try { keys = _nativeKeys.call(Object, obj); } catch(e) { return; }
            if (!_asPetCatalog && _looksLikePetCatalog(obj, keys)) {
                _asPetCatalog = obj;
                console.log('[GardenOverview] Pet catalog captured (' + keys.length + ' species). Sample keys:', keys.slice(0, 10));
                _tryRestoreKeys();
                return;
            }
            if (_looksLikePlantCatalog(obj, keys)) {
                const prevCount = _asPlantCatalog ? _nativeKeys.call(Object, _asPlantCatalog).length : 0;
                if (keys.length > prevCount) {
                    _asPlantCatalog = obj;
                    console.log('[GardenOverview] Plant catalog captured (' + keys.length + ' species' + (prevCount > 0 ? ', upgraded from ' + prevCount : '') + '). Species:', keys.slice().sort().join(', '));
                    _tryRestoreKeys();
                } else {
                    console.log('[GardenOverview] Plant catalog candidate ignored (' + keys.length + ' species, already have ' + prevCount + ').');
                }
                return;
            }
            if (depth >= 3) return;
            for (let i = 0; i < keys.length; i++) {
                try { const v = obj[keys[i]]; if (v && typeof v === 'object') _scan(v, depth + 1); } catch(e) {}
            }
        }

        let _currentKeys = _nativeKeys;
        let _inKeys = false;
        try {
            Object.defineProperty(Object, 'keys', {
                get() {
                    return function(obj) {
                        if (_inKeys) return _nativeKeys.call(Object, obj);
                        _inKeys = true;
                        try {
                            const result = _currentKeys.call(Object, obj);
                            if (!_asPetCatalog || !_asPlantCatalog) { try { _scan(obj, 0); } catch(e) {} }
                            return result;
                        } finally {
                            _inKeys = false;
                        }
                    };
                },
                set(fn) { _currentKeys = fn; },
                configurable: true,
            });
            console.log('[GardenOverview] Object.keys override installed (sticky)');
        } catch(e) {
            console.warn('[GardenOverview] defineProperty on Object.keys failed, using plain override:', e);
            Object.keys = function(obj) {
                if (_inKeys) return _nativeKeys.call(Object, obj);
                _inKeys = true;
                try {
                    const result = _nativeKeys.call(Object, obj);
                    if (!_asPetCatalog || !_asPlantCatalog) { try { _scan(obj, 0); } catch(e2) {} }
                    return result;
                } finally {
                    _inKeys = false;
                }
            };
        }

        // Safety net: never leave the override (and its per-call _scan) installed forever
        // if one catalog is never matched (e.g. a game update changes its shape).
        setTimeout(function() {
            if (_keysRestored) return;
            if (!_asPetCatalog || !_asPlantCatalog) {
                console.warn('[GardenOverview] Catalog capture incomplete after 120s (pet: ' + !!_asPetCatalog + ', plant: ' + !!_asPlantCatalog + ')');
            }
            _restoreKeysNow('fallback timeout');
        }, 120000);
    })();

    function _getPlantSellPrice(species) { return _asPlantCatalog?.[species]?.crop?.baseSellPrice; }
    function _getPlantMaxScale(species)  { return _asPlantCatalog?.[species]?.crop?.maxScale; }

    // === GM helpers ===
    function setMagicCircleValue(key, value) {
        try { GM_setValue('magiccircle_' + key, value); } catch(e) { console.warn('[GardenOverview] GM_setValue failed:', key, e); }
    }
    function getMagicCircleValue(key, defaultValue) {
        try { return GM_getValue('magiccircle_' + key, defaultValue); } catch(e) { return defaultValue; }
    }
    let _wsPlayerId = null;
    let _wsLoggedPlayerId = null;
    let _wsMySlotIndex = null;

    // === Plant focus ===
    const PLANT_FOCUS_DEFAULTS = {
        enabled: false,
        scope: 'tracked',
        mutations: [],
        mutationRule: 'all',
        invert: false,
        opacity: 0.2
    };
    const PLANT_FOCUS_MUTATIONS = [
        ['Gold', 'Gold'],
        ['Rainbow', 'Rainbow'],
        ['Wet', 'Wet'],
        ['Chilled', 'Chilled'],
        ['Frozen', 'Frozen'],
        ['Thunderstruck', 'Thunderstruck'],
        ['Dawnlit', 'Dawnlit'],
        ['Ambershine', 'Amberlit'],
        ['Dawncharged', 'Dawnbound'],
        ['Ambercharged', 'Amberbound'],
        ['Thundercharged', 'Thundercharged']
    ];
    let _focusTileSystem = null;
    let _focusOriginalAlpha = new WeakMap();
    let _focusDesiredAlpha = new WeakMap();
    const _focusManagedDisplays = new Set();
    const _focusTileSystemsByViews = new WeakMap();

    function _getPlantFocusConfig() {
        const stored = getMagicCircleValue('plant_focus_filter', null) || {};
        const config = Object.assign({}, PLANT_FOCUS_DEFAULTS, stored);
        if (!Array.isArray(stored.mutations)) {
            const legacy = stored.mutation || 'any';
            if (legacy === 'rainbow') config.mutations = ['Rainbow'];
            else if (legacy === 'gold') config.mutations = ['Gold'];
            else if (legacy === 'color') { config.mutations = ['Gold', 'Rainbow']; config.mutationRule = 'any'; }
            else if (legacy === 'neither') { config.mutations = ['Gold', 'Rainbow']; config.mutationRule = 'none'; }
            else config.mutations = [];
        }
        return config;
    }
    function _savePlantFocusConfig(config) {
        setMagicCircleValue('plant_focus_filter', Object.assign({}, PLANT_FOCUS_DEFAULTS, config));
    }
    function _getPlantFocusTrackedSpecies() {
        const defaults = _getTrackedSpeciesDefaults();
        const config = Object.assign({}, defaults, getMagicCircleValue('tracked_species', null) || {});
        return new Set(Object.keys(config).filter(function(species) { return !!config[species]; }));
    }
    function _getPlantFocusMutationOptions() {
        const labels = new Map(PLANT_FOCUS_MUTATIONS);
        const garden = state.atoms.playerSlot?.data?.garden;
        const tiles = garden && garden.tileObjects ? Object.values(garden.tileObjects) : [];
        tiles.forEach(function(tile) {
            (Array.isArray(tile?.slots) ? tile.slots : []).forEach(function(slot) {
                (Array.isArray(slot?.mutations) ? slot.mutations : []).forEach(function(mutation) {
                    if (!labels.has(mutation)) labels.set(mutation, mutation);
                });
            });
        });
        return Array.from(labels, function(pair) { return { id: pair[0], label: pair[1] }; });
    }
    function _plantFocusMutationMatches(slot, selectedMutations, rule) {
        const mutations = slot && Array.isArray(slot.mutations) ? slot.mutations : [];
        if (rule === 'none') {
            return selectedMutations.every(function(mutation) { return !mutations.includes(mutation); });
        }
        if (rule === 'any') return selectedMutations.some(function(mutation) { return mutations.includes(mutation); });
        if (!selectedMutations.length) return mutations.length === 0;
        return selectedMutations.every(function(mutation) { return mutations.includes(mutation); });
    }
    function _plantFocusMatches(tileObject, slot, config, trackedSpecies, ignorePreserved) {
        if (ignorePreserved && slot?.preserved === true) return false;
        const species = tileObject && tileObject.species;
        let scopeMatches = config.scope === 'all';
        if (config.scope === 'tracked') scopeMatches = trackedSpecies.has(species);
        else if (config.scope !== 'all') scopeMatches = species === config.scope;
        const selectedMutations = Array.isArray(config.mutations) ? config.mutations : [];
        const matches = scopeMatches && _plantFocusMutationMatches(slot, selectedMutations, config.mutationRule);
        return config.invert ? !matches : matches;
    }
    function _fadePlantFocusDisplay(displayObject, opacity, seen) {
        if (!displayObject) return;
        seen.add(displayObject);
        if (!_focusOriginalAlpha.has(displayObject)) {
            _focusOriginalAlpha.set(displayObject, Number.isFinite(displayObject.alpha) ? displayObject.alpha : 1);
            _focusManagedDisplays.add(displayObject);
        }
        const desiredAlpha = _focusOriginalAlpha.get(displayObject) * opacity;
        _focusDesiredAlpha.set(displayObject, desiredAlpha);
        displayObject.alpha = desiredAlpha;
    }
    function _restorePlantFocusDisplay(displayObject) {
        if (!_focusOriginalAlpha.has(displayObject)) return;
        if (!displayObject.destroyed) displayObject.alpha = _focusOriginalAlpha.get(displayObject);
        _focusOriginalAlpha.delete(displayObject);
        _focusDesiredAlpha.delete(displayObject);
        _focusManagedDisplays.delete(displayObject);
    }
    function _restoreAllPlantFocus() {
        Array.from(_focusManagedDisplays).forEach(_restorePlantFocusDisplay);
    }
    function _enforcePlantFocusDisplay(displayObject) {
        if (!_focusManagedDisplays.has(displayObject)) return;
        if (displayObject.destroyed) {
            _focusOriginalAlpha.delete(displayObject);
            _focusDesiredAlpha.delete(displayObject);
            _focusManagedDisplays.delete(displayObject);
            return;
        }
        const desiredAlpha = _focusDesiredAlpha.get(displayObject);
        if (Number.isFinite(desiredAlpha) && displayObject.alpha !== desiredAlpha) displayObject.alpha = desiredAlpha;
    }
    function _getPlantFocusCropContainer(cropVisual) {
        return cropVisual?.cropVisual?.container || cropVisual?.container || null;
    }
    function _armPlantFocusTileView(view) {
        if (!view || typeof view.draw !== 'function' || view.__gardenOverviewFocusDrawWrapped) return;
        const originalDraw = view.draw;
        view.__gardenOverviewFocusDrawWrapped = true;
        view.draw = function() {
            const result = originalDraw.apply(this, arguments);
            _enforcePlantFocusDisplay(view.childView?.plantVisual?.container);
            const cropVisuals = view.childView?.plantVisual?.getCropVisuals?.() || [];
            cropVisuals.forEach(function(cropVisual) { _enforcePlantFocusDisplay(_getPlantFocusCropContainer(cropVisual)); });
            return result;
        };
    }
    function _applyPlantFocusFade() {
        const config = _getPlantFocusConfig();
        const tileSystem = _focusTileSystem;
        const tileViews = tileSystem && tileSystem.tileViews;
        const dirtMap = tileSystem && tileSystem.map && tileSystem.map.globalTileIdxToDirtTile;
        if (!config.enabled || _wsMySlotIndex == null || !(tileViews instanceof targetWindow.Map) || !dirtMap) {
            _restoreAllPlantFocus();
            return;
        }

        const trackedSpecies = _getPlantFocusTrackedSpecies();
        const mutationConfig = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
        const ignorePreserved = mutationConfig.ignorePreserved !== false;
        const opacity = Math.max(0.05, Math.min(0.8, Number(config.opacity) || PLANT_FOCUS_DEFAULTS.opacity));
        const seen = new Set();
        tileViews.forEach(function(view, globalTileIndex) {
            const dirtTile = typeof dirtMap.get === 'function' ? dirtMap.get(globalTileIndex) : dirtMap[globalTileIndex];
            const tileObject = view && view.tileObject;
            const displayObject = view && view.displayObject;
            if (!dirtTile || dirtTile.userSlotIdx !== _wsMySlotIndex ||
                !tileObject || tileObject.objectType !== 'plant' || !displayObject) return;

            const slots = Array.isArray(tileObject.slots) ? tileObject.slots : [];
            const slotVisibility = new Map();
            slots.forEach(function(slot) {
                slotVisibility.set(slot.slotId, _plantFocusMatches(tileObject, slot, config, trackedSpecies, ignorePreserved));
            });
            const hasVisibleSlot = Array.from(slotVisibility.values()).some(Boolean);
            _armPlantFocusTileView(view);
            const plantVisual = view.childView?.plantVisual;
            if (!plantVisual?.container) return;
            const cropVisuals = plantVisual.getCropVisuals?.() || [];

            if (!hasVisibleSlot) {
                _fadePlantFocusDisplay(plantVisual.container, opacity, seen);
                cropVisuals.forEach(function(cropVisual) { _restorePlantFocusDisplay(_getPlantFocusCropContainer(cropVisual)); });
                return;
            }

            _restorePlantFocusDisplay(plantVisual.container);
            cropVisuals.forEach(function(cropVisual) {
                const cropContainer = _getPlantFocusCropContainer(cropVisual);
                if (slotVisibility.get(cropVisual?.slotId) === false) {
                    _fadePlantFocusDisplay(cropContainer, opacity, seen);
                } else {
                    _restorePlantFocusDisplay(cropContainer);
                }
            });
        });

        Array.from(_focusManagedDisplays).forEach(function(displayObject) {
            if (!seen.has(displayObject)) _restorePlantFocusDisplay(displayObject);
        });
    }
    function _capturePlantFocusTileSystem(system) {
        if (!system || system === _focusTileSystem) return;
        _restoreAllPlantFocus();
        _focusTileSystem = system;
        if (typeof system.destroy === 'function' && !system.__gardenOverviewFocusDestroyWrapped) {
            const originalDestroy = system.destroy;
            system.__gardenOverviewFocusDestroyWrapped = true;
            system.destroy = function() {
                if (_focusTileSystem === system) {
                    _restoreAllPlantFocus();
                    _focusTileSystem = null;
                    setTimeout(_armPlantFocusTileCapture, 0);
                }
                return originalDestroy.apply(this, arguments);
            };
        }
        setTimeout(_applyPlantFocusFade, 0);
    }
    function _armPlantFocusTileCapture() {
        if (_focusTileSystem) return;
        const proto = targetWindow.Object.prototype;
        const existing = Object.getOwnPropertyDescriptor(proto, 'tileViews');
        if (existing && existing.get && existing.get.__gardenOverviewFocusTrap) return;
        if (existing && !existing.configurable) return;

        let storedValue;
        const priorGetter = existing && existing.get;
        const priorSetter = existing && existing.set;
        const getter = function() { return priorGetter ? priorGetter.call(this) : storedValue; };
        getter.__gardenOverviewFocusTrap = true;
        Object.defineProperty(proto, 'tileViews', {
            configurable: true,
            get: getter,
            set: function(value) {
                if (priorSetter) priorSetter.call(this, value);
                else Object.defineProperty(this, 'tileViews', {
                    configurable: true, enumerable: true, writable: true, value: value
                });
                if (this && this.name === 'tileObject' && value instanceof targetWindow.Map) {
                    _capturePlantFocusTileSystem(this);
                }
            }
        });
    }
    function _armPlantFocusMapCapture() {
        const mapProto = targetWindow.Map && targetWindow.Map.prototype;
        if (!mapProto || mapProto.set?.__gardenOverviewFocusMapWrapped) return;
        const originalSet = mapProto.set;
        const wrappedSet = function(key, value) {
            const result = originalSet.apply(this, arguments);
            try {
                const map = value?.map;
                const looksLikeTileView = Number.isInteger(key) && value?.globalTileIdx === key &&
                    value?.displayObject && 'tileObject' in value && typeof value.onDataChanged === 'function' &&
                    map?.globalTileIdxToDirtTile && map?.globalTileIdxToBoardwalk;
                if (looksLikeTileView && _focusTileSystem?.tileViews !== this) {
                    let system = _focusTileSystemsByViews.get(this);
                    if (!system) {
                        system = { name: 'tileObject', tileViews: this, map: map };
                        _focusTileSystemsByViews.set(this, system);
                    }
                    _capturePlantFocusTileSystem(system);
                }
            } catch (e) { /* capture is best effort */ }
            return result;
        };
        wrappedSet.__gardenOverviewFocusMapWrapped = true;
        mapProto.set = wrappedSet;
    }
    (function _installPlantFocusCapture() {
        const objectCtor = targetWindow.Object;
        if (!objectCtor.__gardenOverviewFocusDefineWrapped) {
            const originalDefineProperty = objectCtor.defineProperty;
            objectCtor.defineProperty = function(target, property, descriptor) {
                const result = originalDefineProperty.apply(this, arguments);
                try {
                    if (property === 'tileViews' && target && target.name === 'tileObject' &&
                        descriptor && descriptor.value instanceof targetWindow.Map) {
                        _capturePlantFocusTileSystem(target);
                    }
                } catch (e) { /* capture is best effort */ }
                return result;
            };
            objectCtor.__gardenOverviewFocusDefineWrapped = true;
        }
        _armPlantFocusTileCapture();
        _armPlantFocusMapCapture();
        setInterval(_applyPlantFocusFade, 600);
    })();

    function _wsReadSelfPlayerId(fullState, room, game) {
        const id =
            (fullState && typeof fullState.selfPlayerId === 'string' ? fullState.selfPlayerId : null) ||
            (room && typeof room.selfPlayerId === 'string' ? room.selfPlayerId : null) ||
            (game && typeof game.selfPlayerId === 'string' ? game.selfPlayerId : null);
        return id || null;
    }
    function _wsReadPlayerId() {
        try {
            const ws = targetWindow.MagicCircle_RoomConnection && targetWindow.MagicCircle_RoomConnection.currentWebSocket;
            if (!ws || !ws.url) return null;
            let pid = new URL(ws.url).searchParams.get('playerId');
            if (pid == null) return null;
            // URL param is JSON-quoted (e.g. "p_xxx") — strip the literal quotes.
            if (pid.length >= 2 && pid.charAt(0) === '"' && pid.charAt(pid.length - 1) === '"') {
                try { pid = JSON.parse(pid); } catch (e) { pid = pid.slice(1, -1); }
            }
            return pid;
        } catch (e) { return null; }
    }
    function _wsPickMySlot(game, room, pid) {
        const slots = game && Array.isArray(game.userSlots) ? game.userSlots : null;
        if (!slots) return null;
        // Manual loops — predicate array methods can misbehave on the game's
        // page-realm arrays under some userscript managers.
        if (pid) {
            for (let i = 0; i < slots.length; i++) {
                const s = slots[i];
                if (s && (s.playerId === pid || (s.data && s.data.playerId === pid))) return s;
            }
        }
        let dbId;
        const players = room && Array.isArray(room.players) ? room.players : null;
        if (players) {
            for (let j = 0; j < players.length; j++) {
                if (players[j] && players[j].id === pid) { dbId = players[j].databaseUserId; break; }
            }
        }
        if (dbId != null) {
            for (let k = 0; k < slots.length; k++) {
                const d = slots[k] && slots[k].data;
                if (d && (d.databaseUserId === dbId || d.userId === dbId)) return slots[k];
            }
        }
        return null;
    }
    function initWsState() {
        const conn = targetWindow.MagicCircle_RoomConnection;
        if (!conn || typeof conn.subscribeToPatches !== 'function') {
            setTimeout(initWsState, 1000); // connection/API not ready yet — retry
            return;
        }
        try {
            conn.subscribeToPatches((patches, fullState) => {
                try {
                    const room = fullState && fullState.data ? fullState.data : null;
                    const game = fullState && fullState.child && fullState.child.data ? fullState.child.data : null;
                    _wsPlayerId = _wsReadSelfPlayerId(fullState, room, game) || _wsPlayerId || _wsReadPlayerId();
                    if (_wsPlayerId && _wsPlayerId !== _wsLoggedPlayerId) {
                        _wsLoggedPlayerId = _wsPlayerId;
                        console.log('[GardenOverview] playerId resolved:', _wsPlayerId);
                    }
                    const mySlot = _wsPickMySlot(game, room, _wsPlayerId);
                    if (mySlot && mySlot.data) {
                        _wsMySlotIndex = null;
                        for (let slotIndex = 0; slotIndex < game.userSlots.length; slotIndex++) {
                            if (game.userSlots[slotIndex] === mySlot) { _wsMySlotIndex = slotIndex; break; }
                        }
                        state.atoms.playerSlot = mySlot;
                        if (mySlot.data.inventory) state.atoms.inventory = mySlot.data.inventory;
                        if (Array.isArray(mySlot.data.petSlots)) state.atoms.activePets = mySlot.data.petSlots;
                    }
                    if (room && Array.isArray(room.players)) {
                        state.atoms.numFriendsInRoom = Math.max(0, room.players.length - 1);
                    }
                } catch (e) { /* ignore per-update errors */ }
            });
            console.log('[GardenOverview] Subscribed to room patches (WS state)');
        } catch (e) {
            console.warn('[GardenOverview] subscribeToPatches failed:', e);
            setTimeout(initWsState, 2000);
        }
    }

    // === Constants ===

    const _DEFAULT_TRACKED_TRUE = new Set(['Starweaver', 'DawnCelestial', 'MoonCelestial', 'Dawnbreaker']);
    function _getTrackedSpeciesDefaults() {
        if (!_asPlantCatalog) return {};
        return Object.fromEntries(Object.keys(_asPlantCatalog).map(function(s) { return [s, _DEFAULT_TRACKED_TRUE.has(s)]; }));
    }

    const MUTATION_DEFAULTS = {
        wet: false, chilled: false, frozen: true,
        amberlit: true, dawnlit: true, dawncharged: true, ambercharged: true,
        thunderstruck: true, thundercharged: true, rainbow: true, gold: true,
        none: true,
        combineRainbow: false, combineAmberDawn: false, combineDawnAmbercharged: false,
        combineFrozenThunderstruck: false,
        granterAllGarden: true,
        ignorePreserved: true
    };
    function shouldIgnorePreservedSlot(slot) {
        const config = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
        return config.ignorePreserved !== false && slot?.preserved === true;
    }

    let _granterAlarmAudioCtx = null;
    let _granterAlarmInterval = null;
    let _granterAlarmBanner = null;
    const _granterAlarmCompleted = new Set();

    function _getGranterAlarmAudioCtx() {
        if (!_granterAlarmAudioCtx || _granterAlarmAudioCtx.state === 'closed') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            _granterAlarmAudioCtx = new AudioCtx();
        }
        if (_granterAlarmAudioCtx.state === 'suspended') void _granterAlarmAudioCtx.resume();
        return _granterAlarmAudioCtx;
    }

    function _playGranterAlarmTone(ctx, frequency) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
    }

    function _startGranterAlarmSound() {
        if (_granterAlarmInterval) clearInterval(_granterAlarmInterval);
        const ctx = _getGranterAlarmAudioCtx();
        const pattern = [880, 660, 880, 660, 0];
        let phase = 0;
        const tick = () => {
            const frequency = pattern[phase % pattern.length];
            if (frequency) _playGranterAlarmTone(ctx, frequency);
            phase++;
        };
        tick();
        _granterAlarmInterval = setInterval(tick, 420);
    }

    function _stopGranterAlarm() {
        if (_granterAlarmInterval) clearInterval(_granterAlarmInterval);
        _granterAlarmInterval = null;
        _granterAlarmBanner?.remove();
        _granterAlarmBanner = null;
    }

    function _showGranterAlarmBanner(message) {
        _granterAlarmBanner?.remove();
        if (!document.getElementById('go-granter-alarm-style')) {
            const style = document.createElement('style');
            style.id = 'go-granter-alarm-style';
            style.textContent = `
                @keyframes go-granter-alarm-pulse {
                    0%,100% { border-color:rgba(190,140,255,0.6);box-shadow:0 0 22px rgba(140,90,255,0.35),0 8px 40px rgba(0,0,0,0.8); }
                    50% { border-color:rgba(255,200,80,0.9);box-shadow:0 0 44px rgba(255,170,40,0.55),0 8px 40px rgba(0,0,0,0.8); }
                }
                #go-granter-alarm-stop:hover { background:rgba(255,255,255,0.22) !important; }
            `;
            document.head.appendChild(style);
        }
        const banner = document.createElement('div');
        banner.id = 'go-granter-alarm-banner';
        banner.style.cssText = `
            position:fixed;top:22px;left:50%;transform:translateX(-50%);
            background:rgba(14,8,24,0.97);border:2px solid rgba(190,140,255,0.6);
            border-radius:14px;padding:13px 18px;z-index:999999;font-family:sans-serif;
            display:flex;align-items:center;gap:14px;max-width:min(560px,calc(100vw - 24px));
            box-shadow:0 0 22px rgba(140,90,255,0.35),0 8px 40px rgba(0,0,0,0.8);
            animation:go-granter-alarm-pulse 1.1s ease-in-out infinite;pointer-events:all;user-select:none;
        `;
        banner.innerHTML = `
            <span style="font-size:26px;line-height:1;flex-shrink:0;">&#x1F514;</span>
            <div style="min-width:0;flex:1;">
                <div style="font-size:10px;color:#888;letter-spacing:1.5px;font-weight:bold;margin-bottom:3px;">GRANTER COMPLETE</div>
                <div style="font-size:15px;color:#fff;font-weight:bold;overflow-wrap:anywhere;">${message}</div>
            </div>
            <button id="go-granter-alarm-stop" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:#fff;border-radius:8px;padding:9px 16px;cursor:pointer;font-size:12px;font-weight:bold;letter-spacing:0.5px;flex-shrink:0;">&#x25A0; Stop</button>
        `;
        document.body.appendChild(banner);
        _granterAlarmBanner = banner;
        banner.querySelector('#go-granter-alarm-stop').addEventListener('click', _stopGranterAlarm);
    }

    // === Helpers ===
    function removeConfigGuis() {
        ['go-mut-config-gui', 'go-species-config-gui', 'go-keybind-config-gui', 'go-plant-focus-gui'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) { el._abort?.abort(); el.remove(); }
        });
    }

    function _makeConfigGuiDraggable(gui, handle) {
        if (!gui || !handle) return;
        const positionKey = 'config_position_' + gui.id;
        handle.style.cursor = 'move';
        handle.style.userSelect = 'none';

        function setPosition(left, top) {
            const maxLeft = Math.max(0, window.innerWidth - gui.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - gui.offsetHeight);
            gui.style.left = Math.max(0, Math.min(maxLeft, left)) + 'px';
            gui.style.top = Math.max(0, Math.min(maxTop, top)) + 'px';
        }

        const saved = getMagicCircleValue(positionKey, null);
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            setPosition(saved.left, saved.top);
        }

        handle.addEventListener('pointerdown', function(e) {
            if (e.button !== 0 || e.target.closest('button,input,select,textarea,a')) return;
            e.preventDefault();
            const rect = gui.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            handle.setPointerCapture?.(e.pointerId);

            function move(ev) {
                setPosition(ev.clientX - offsetX, ev.clientY - offsetY);
            }
            function finish() {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', finish);
                handle.removeEventListener('pointercancel', finish);
                const finalRect = gui.getBoundingClientRect();
                setMagicCircleValue(positionKey, { left: finalRect.left, top: finalRect.top });
            }

            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', finish);
            handle.addEventListener('pointercancel', finish);
        });
    }

    function showPlantFocusConfig(popup) {
        const existing = document.getElementById('go-plant-focus-gui');
        if (existing) { existing.remove(); return; }

        const gui = document.createElement('div');
        gui.id = 'go-plant-focus-gui';
        gui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:300px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.6);color:#d6f7f7;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:9px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;';
        header.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;">&#x25D0; Plant Focus</span>';
        const close = document.createElement('button');
        close.innerHTML = '&#x2715;';
        close.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;';
        close.onclick = function() { gui.remove(); };
        header.appendChild(close);
        gui.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:11px 12px;display:flex;flex-direction:column;gap:11px;font-size:11px;overflow-y:auto;';
        gui.appendChild(body);

        function makeRow(label, control) {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;color:#7ab8b8;';
            const text = document.createElement('span');
            text.textContent = label;
            row.appendChild(text);
            row.appendChild(control);
            return row;
        }
        function styleSelect(select) {
            select.style.cssText = 'width:154px;box-sizing:border-box;padding:5px 7px;border-radius:4px;border:1px solid #1e3a3a;background:#061414;color:#d6f7f7;font:11px monospace;';
            return select;
        }
        function save() {
            const next = {
                enabled: enabled.checked,
                scope: scope.value,
                mutations: Array.from(selectedMutations),
                mutationRule: mutationRule.value,
                invert: invert.checked,
                opacity: Number(opacity.value) / 100
            };
            _savePlantFocusConfig(next);
            opacityValue.textContent = opacity.value + '%';
            const focusButton = popup && popup.querySelector('.plant-focus-btn');
            if (focusButton) {
                focusButton.style.background = next.enabled ? 'rgba(164,245,245,0.2)' : 'rgba(255,255,255,0.08)';
                focusButton.style.color = next.enabled ? '#a4f5f5' : '#7ab8b8';
            }
            _applyPlantFocusFade();
        }

        const config = _getPlantFocusConfig();
        const enabled = document.createElement('input');
        enabled.type = 'checkbox'; enabled.checked = !!config.enabled;
        body.appendChild(makeRow('Enabled', enabled));

        const scope = styleSelect(document.createElement('select'));
        [['tracked', 'Tracked species'], ['all', 'All species']].forEach(function(pair) {
            const option = document.createElement('option');
            option.value = pair[0]; option.textContent = pair[1]; scope.appendChild(option);
        });
        const species = new Set(Object.keys(_getTrackedSpeciesDefaults()));
        _getGardenSpeciesCounts().forEach(function(_count, name) { species.add(name); });
        Array.from(species).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(name) {
            const option = document.createElement('option');
            option.value = name; option.textContent = name; scope.appendChild(option);
        });
        scope.value = config.scope;
        if (!scope.value) scope.value = 'tracked';
        body.appendChild(makeRow('Show', scope));

        const selectedMutations = new Set(Array.isArray(config.mutations) ? config.mutations : []);
        const mutationRule = styleSelect(document.createElement('select'));
        [['all', 'All selected'], ['any', 'Any selected'], ['none', 'None selected']].forEach(function(pair) {
            const option = document.createElement('option');
            option.value = pair[0]; option.textContent = pair[1]; mutationRule.appendChild(option);
        });
        mutationRule.value = config.mutationRule;
        if (!mutationRule.value) mutationRule.value = 'all';
        body.appendChild(makeRow('Mutation rule', mutationRule));

        const mutationSection = document.createElement('div');
        mutationSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const mutationHeader = document.createElement('div');
        mutationHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#7ab8b8;';
        const mutationTitle = document.createElement('span');
        const clearMutations = document.createElement('button');
        clearMutations.textContent = 'Clear';
        clearMutations.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid #1e3a3a;color:#7ab8b8;border-radius:4px;padding:3px 7px;font:10px monospace;cursor:pointer;';
        mutationHeader.appendChild(mutationTitle); mutationHeader.appendChild(clearMutations);
        const mutationGrid = document.createElement('div');
        mutationGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
        mutationSection.appendChild(mutationHeader); mutationSection.appendChild(mutationGrid);
        body.appendChild(mutationSection);

        const mutationOptions = _getPlantFocusMutationOptions();
        selectedMutations.forEach(function(id) {
            if (!mutationOptions.some(function(option) { return option.id === id; })) mutationOptions.push({ id: id, label: id });
        });
        function renderMutationPills() {
            mutationTitle.textContent = 'Mutations (' + selectedMutations.size + ')';
            mutationGrid.innerHTML = '';
            mutationOptions.forEach(function(option) {
                const active = selectedMutations.has(option.id);
                const button = document.createElement('button');
                button.textContent = option.label;
                button.style.cssText = 'border:1px solid ' + (active ? '#4fa3a3' : '#1e3a3a') + ';background:' + (active ? 'rgba(79,163,163,0.22)' : 'rgba(255,255,255,0.04)') + ';color:' + (active ? '#a4f5f5' : '#6f9b9b') + ';border-radius:4px;padding:4px 7px;font:10px monospace;cursor:pointer;';
                button.onclick = function() {
                    if (active) selectedMutations.delete(option.id); else selectedMutations.add(option.id);
                    renderMutationPills();
                    save();
                };
                mutationGrid.appendChild(button);
            });
        }
        clearMutations.onclick = function() { selectedMutations.clear(); renderMutationPills(); save(); };
        renderMutationPills();

        const invert = document.createElement('input');
        invert.type = 'checkbox'; invert.checked = !!config.invert;
        body.appendChild(makeRow('Invert match', invert));

        const opacityWrap = document.createElement('div');
        opacityWrap.style.cssText = 'width:154px;display:flex;align-items:center;gap:7px;';
        const opacity = document.createElement('input');
        opacity.type = 'range'; opacity.min = '5'; opacity.max = '60'; opacity.step = '5';
        opacity.value = String(Math.round((Number(config.opacity) || PLANT_FOCUS_DEFAULTS.opacity) * 100));
        opacity.style.cssText = 'width:112px;accent-color:#4fa3a3;';
        const opacityValue = document.createElement('span');
        opacityValue.style.cssText = 'width:34px;text-align:right;color:#a4f5f5;';
        opacityValue.textContent = opacity.value + '%';
        opacityWrap.appendChild(opacity); opacityWrap.appendChild(opacityValue);
        body.appendChild(makeRow('Faded opacity', opacityWrap));

        [enabled, scope, mutationRule, invert, opacity].forEach(function(control) {
            control.addEventListener('input', save);
            control.addEventListener('change', save);
        });
        [enabled, scope, mutationRule, invert, opacity].forEach(function(control) {
            control.addEventListener('change', function() { control.blur(); });
        });

        document.body.appendChild(gui);
        gui.style.left = Math.round((window.innerWidth - gui.offsetWidth) / 2) + 'px';
        gui.style.top = Math.round((window.innerHeight - gui.offsetHeight) / 2) + 'px';
        _makeConfigGuiDraggable(gui, header);
    }

    // Shared scoped stylesheet for the config panels (pills, actions, search, section labels).
    function _makeConfigStyle(id) {
        const style = document.createElement('style');
        style.textContent = `
            #${id} .go-sp-section { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#4a8a8a; margin:9px 0 5px; }
            #${id} .go-sp-section:first-child { margin-top:0; }
            #${id} .go-sp-wrap { display:flex; flex-wrap:wrap; gap:4px; }
            #${id} .go-sp-pill {
                display:inline-flex; align-items:center; gap:5px;
                padding:4px 9px; border-radius:8px;
                border:1px solid #1e3a3a; background:#0c2020;
                color:#8fc4c4; font-size:10px; font-family:monospace;
                cursor:pointer; white-space:nowrap; user-select:none;
                transition:background .12s ease, border-color .12s ease, color .12s ease, transform .06s ease;
            }
            #${id} .go-sp-pill:hover { border-color:#33807e; background:#123333; color:#d6f7f7; }
            #${id} .go-sp-pill:active { transform:scale(0.95); }
            #${id} .go-sp-pill.on {
                border-color:#3aa6a0; background:linear-gradient(180deg,#11524d,#0c3d3a);
                color:#eaffff; box-shadow:0 0 0 1px rgba(58,166,160,0.25), 0 1px 5px rgba(0,0,0,0.45);
            }
            #${id} .go-sp-pill.on:hover { background:linear-gradient(180deg,#136058,#0e4642); }
            #${id} .go-sp-check { color:#41e0c8; font-size:9px; line-height:1; margin-top:1px; }
            #${id} .go-sp-count { opacity:0.5; font-size:9px; }
            #${id} .go-sp-action {
                flex:1; padding:5px 6px; border-radius:7px;
                border:1px solid #1e3a3a; background:#0c2020; color:#8fc4c4;
                font-size:10px; cursor:pointer; font-family:monospace;
                transition:background .12s ease, border-color .12s ease, color .12s ease;
            }
            #${id} .go-sp-action:hover { border-color:#33807e; background:#123333; color:#d6f7f7; }
            #${id} .go-sp-search::placeholder { color:#3f6e6e; }
            #${id} .go-sp-search:focus { border-color:#33807e; }
        `;
        return style;
    }

    // Slot counts per species currently planted in the garden (whole garden, not just tracked).
    function _getGardenSpeciesCounts() {
        const tileObjects = state.atoms.playerSlot?.data?.garden?.tileObjects;
        const counts = new Map();
        if (!tileObjects) return counts;
        Object.values(tileObjects).forEach(function(tile) {
            if (tile.objectType !== 'plant' || !tile.slots?.length) return;
            tile.slots.forEach(function(slot) {
                if (shouldIgnorePreservedSlot(slot)) return;
                const sp = slot.species || tile.species || '';
                if (sp) counts.set(sp, (counts.get(sp) || 0) + 1);
            });
        });
        return counts;
    }

    function formatFarmValue(value) {
        if (value >= 1_000_000_000_000) return (value / 1_000_000_000_000).toFixed(2) + 'T';
        if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
        if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
        if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
        return value.toString();
    }

    // === getFarmStatsData ===
    function getFarmStatsData() {
        const RAINBOW_MUTATION = 'Rainbow';
        const GOLD_MUTATION = 'Gold';
        const FROZEN_MUTATION = 'Frozen';
        const AMBERCHARGED_MUTATION = 'Ambercharged';
        const AMBERSHINE_MUTATION = 'Ambershine';

        const COLOR_MULT = { Gold: 25, Rainbow: 50 };
        const WEATHER_MULT = { Wet: 2, Chilled: 2, Frozen: 6, Thunderstruck: 5, Thundercharged: 7 };
        const TIME_MULT = { Dawnlit: 4, Dawnbound: 7, Dawncharged: 7, Ambershine: 6, Amberbound: 10, Ambercharged: 10 };
        const WEATHER_TIME_COMBO = {
            "Wet+Dawnlit": 5, "Chilled+Dawnlit": 5, "Wet+Ambershine": 7, "Chilled+Ambershine": 7,
            "Frozen+Dawnlit": 9, "Frozen+Dawnbound": 12, "Frozen+Dawncharged": 12,
            "Frozen+Ambershine": 11, "Frozen+Amberbound": 15, "Frozen+Ambercharged": 15,
            "Thunderstruck+Dawnlit": 8, "Thunderstruck+Dawnbound": 11, "Thunderstruck+Dawncharged": 11,
            "Thunderstruck+Ambershine": 10, "Thunderstruck+Amberbound": 14, "Thunderstruck+Ambercharged": 14,
            "Thundercharged+Dawnlit": 10, "Thundercharged+Dawnbound": 13, "Thundercharged+Dawncharged": 13,
            "Thundercharged+Ambershine": 12, "Thundercharged+Amberbound": 16, "Thundercharged+Ambercharged": 16
        };

        const numFriendsInRoom = state.atoms.numFriendsInRoom;
        const FRIEND_BONUS = typeof numFriendsInRoom === 'number' ? 1 + Math.min(numFriendsInRoom, 5) * 0.10 : null;

        const playerSlot = state.atoms.playerSlot;
        if (!playerSlot) return null;

        const tileObjects = playerSlot.data?.garden?.tileObjects;
        if (!tileObjects) return null;

        const _defaults = _getTrackedSpeciesDefaults();
        const trackedSpeciesConfig = Object.assign({}, _defaults, getMagicCircleValue('tracked_species', null) || {});
        const trackedSpecies = Object.keys(trackedSpeciesConfig).filter(k => trackedSpeciesConfig[k]);
        const mutationConfig = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
        const ignorePreserved = mutationConfig.ignorePreserved !== false;

        const currentTime = Date.now();
        const activePets = state.atoms.activePets || [];
        const inventoryPets = (state.atoms.inventory?.items || []).filter(i => i.itemType === 'Pet');
        const hutchPets = (state.atoms.inventory?.storages || []).filter(s => s.decorId === 'PetHutch').flatMap(s => s.items || []);
        const allAvailablePets = [...activePets, ...inventoryPets, ...hutchPets];

        const stats = {
            missingRainbow: 0, missingGold: 0, goldCount: 0, missingFrozen: 0,
            missingThunderstruck: 0,
            missingWet: 0, missingChilled: 0,
            missingAmber: 0, missingAmberlit: 0, missingAmbercharged: 0,
            missingDawnlit: 0, missingDawncharged: 0,
            missingAmberDawn: 0, missingDawnAmbercharged: 0,
            frozenCount: 0, wetCount: 0, chilledCount: 0, thunderstruckCount: 0, thunderchargedCount: 0,
            noMutations: 0, notMature: 0, notMaxSize: 0,
            readyNow: 0,
            boostsUntilMaxSize: 0, totalFarmValue: 0,
            plantCounts: {},
            maxEndTime: 0, minEndTime: Infinity,
            // All-garden eligible-slot counts feeding the granter ETAs (granters act on the whole garden).
            granterPool: { totalSlots: 0, rainbow: 0, gold: 0, frozen: 0, thunderstruck: 0, wet: 0, chilled: 0, amber: 0, boosts: 0, boostsBee: 0 },
        };

        function asPetMaxScale(petSpecies) {
            const entry = _asPetCatalog && _asPetCatalog[petSpecies];
            return (entry && entry.maxScale > 1) ? entry.maxScale : null;
        }

        function asPetXpPerLevel(petSpecies) {
            const entry = _asPetCatalog && _asPetCatalog[petSpecies];
            return (entry && entry.hoursToMature > 0) ? Math.floor(3600 * entry.hoursToMature / 30) : null;
        }

        function getGranterETA(pets, abilityKey, multiplier, missingCount) {
            const keys = Array.isArray(abilityKey) ? abilityKey : [abilityKey];
            const granterPets = (pets || []).filter(p =>
                p && p.hunger > 0 && p.abilities?.some(a => keys.includes(a))
            );
            if (!granterPets.length) return null;
            const combinedTickRate = 1 - granterPets.reduce((acc, p) => {
                const maxScale = asPetMaxScale(p.petSpecies);
                const xpPerLevel = asPetXpPerLevel(p.petSpecies);
                if (!maxScale || !xpPerLevel) return acc;
                const xpComp = Math.min(Math.floor((p.xp || 0) / xpPerLevel), 30);
                const scaleComp = Math.floor((((p.targetScale || 1) - 1) / (maxScale - 1)) * 20 + 80) - 30;
                const str = xpComp + scaleComp;
                const chancePerMin = multiplier * (str / 100);
                const tickRate = 1 - Math.pow(1 - chancePerMin / 100, 1 / 60);
                return acc * (1 - tickRate);
            }, 1);
            if (combinedTickRate <= 0) return null;
            const meanWaitSec = 1 / combinedTickRate;
            return { petCount: granterPets.length, meanWaitSec, estimatedTotalSec: missingCount * meanWaitSec };
        }

        function getTurtleExpectations(pets) {
            const turtles = (pets || []).filter(p =>
                p && p.petSpecies === 'Turtle' && p.hunger > 0 &&
                p.abilities?.some(a =>
                    a === 'Plant Growth Boost II' || a === 'PlantGrowthBoostII' ||
                    a === 'Plant Growth Boost 2' ||
                    (typeof a === 'string' && a.toLowerCase().includes('plant') && a.toLowerCase().includes('growth') && (a.includes('II') || a.includes('2')))
                )
            );
            let expectedMinutesRemoved = 0;
            turtles.forEach(p => {
                // Fallbacks are Turtle's known values (100h to mature, 2.5 max scale) for when the catalog isn't captured yet
                const xpPerLevel = asPetXpPerLevel(p.petSpecies) || 12000;
                const petMaxScale = asPetMaxScale(p.petSpecies) || 2.5;
                const xpComponent = Math.min(Math.floor((p.xp || 0) / xpPerLevel), 30);
                const scaleComponent = Math.floor((((p.targetScale || 1) - 1) / (petMaxScale - 1)) * 20 + 80) - 30;
                const base = xpComponent + scaleComponent;
                const minutesRemoved = (base / 100 * 5) * 60 * (1 - Math.pow(1 - 0.27 * base / 100, 1 / 60));
                expectedMinutesRemoved += minutesRemoved;
            });
            return { expectedMinutesRemoved };
        }

        const turtleExpectations = getTurtleExpectations(activePets);
        const hasTurtleBoost = turtleExpectations.expectedMinutesRemoved > 0;

        Object.entries(tileObjects).forEach(([tileId, tile]) => {
            if (tile.objectType !== 'plant' || !tile.slots?.length) return;

            const eligibleSlots = ignorePreserved ? tile.slots.filter(slot => slot.preserved !== true) : tile.slots;
            if (trackedSpecies.includes(tile.species) && eligibleSlots.length > 0) {
                stats.plantCounts[tile.species] = (stats.plantCounts[tile.species] || 0) + 1;
            }

            tile.slots.forEach((slot, slotIndex) => {
                if (ignorePreserved && slot.preserved === true) return;
                const slotSpecies = slot.species || tile.species;
                const isTargetSpecies = trackedSpecies.includes(slotSpecies);
                const maxScale = _getPlantMaxScale(slotSpecies);
                const mutations = slot.mutations || [];

                // All-garden granter pool — granters act on every plant slot, tracked or not, so the
                // ETA math counts the whole garden (mirrors the tracked "missing" conditions below).
                {
                    const gpFrozen     = mutations.includes(FROZEN_MUTATION);
                    const gpThunder    = mutations.includes('Thunderstruck') || mutations.includes('Thundercharged');
                    const gpWet        = mutations.includes('Wet');
                    const gpChilled    = mutations.includes('Chilled');
                    const gpAnyWeather = gpWet || gpChilled || gpFrozen || gpThunder;
                    const gpColor      = mutations.includes(RAINBOW_MUTATION) || mutations.includes(GOLD_MUTATION);
                    const gpNoTime     = !mutations.includes(AMBERCHARGED_MUTATION) && !mutations.includes(AMBERSHINE_MUTATION) && !mutations.includes('Dawnlit') && !mutations.includes('Dawncharged');
                    const gp = stats.granterPool;
                    gp.totalSlots++;
                    if (!gpColor) { gp.rainbow++; gp.gold++; }
                    if (!gpFrozen && !gpThunder) gp.frozen++;
                    if (!gpAnyWeather) gp.thunderstruck++;
                    if (!gpWet && !gpThunder && !gpFrozen) gp.wet++;
                    if (!gpChilled && !gpThunder && !gpFrozen) gp.chilled++;
                    if (gpNoTime) gp.amber++;
                }

                if (isTargetSpecies) {
                    stats.plantCounts[slotSpecies + 'Slots'] = (stats.plantCounts[slotSpecies + 'Slots'] || 0) + 1;
                    if (slot.endTime > stats.maxEndTime) stats.maxEndTime = slot.endTime;
                    if (slot.endTime > currentTime && slot.endTime < stats.minEndTime) stats.minEndTime = slot.endTime;
                    if (currentTime < slot.endTime) stats.notMature++;
                    else stats.readyNow++;
                }

                if (isTargetSpecies && maxScale && (slot.targetScale || 1) < maxScale) stats.notMaxSize++;

                if (isTargetSpecies && !mutations.includes(RAINBOW_MUTATION) && !mutations.includes(GOLD_MUTATION)) stats.missingRainbow++;
                if (isTargetSpecies && mutations.includes(GOLD_MUTATION)) stats.goldCount++;
                if (isTargetSpecies && !mutations.includes(GOLD_MUTATION) && !mutations.includes(RAINBOW_MUTATION)) stats.missingGold++;
                if (isTargetSpecies && mutations.includes(FROZEN_MUTATION)) stats.frozenCount++;
                if (isTargetSpecies && !mutations.includes(FROZEN_MUTATION) && !mutations.includes('Thunderstruck') && !mutations.includes('Thundercharged')) stats.missingFrozen++;
                if (isTargetSpecies && !mutations.includes(AMBERCHARGED_MUTATION) && !mutations.includes(AMBERSHINE_MUTATION) && !mutations.includes('Dawnlit') && !mutations.includes('Dawncharged')) stats.missingAmber++;
                if (isTargetSpecies && !mutations.includes(AMBERCHARGED_MUTATION)) stats.missingAmbercharged++;
                if (isTargetSpecies) {
                    if (mutations.includes('Rainbow')) stats.plantCounts[`${slotSpecies}Rainbow`] = (stats.plantCounts[`${slotSpecies}Rainbow`] || 0) + 1;
                    if (mutations.includes('Gold'))    stats.plantCounts[`${slotSpecies}Gold`]    = (stats.plantCounts[`${slotSpecies}Gold`]    || 0) + 1;
                }
                if (isTargetSpecies) {
                    const hasThunderstruck = mutations.includes('Thunderstruck');
                    const hasThundercharged = mutations.includes('Thundercharged');
                    const hasThunder = hasThunderstruck || hasThundercharged;
                    const hasFrozenMut = mutations.includes(FROZEN_MUTATION);
                    const hasWet = mutations.includes('Wet');
                    const hasChilled = mutations.includes('Chilled');
                    const hasAnyWeather = hasWet || hasChilled || hasFrozenMut || hasThunder;
                    if (hasWet) stats.wetCount++;
                    if (!hasWet && !hasThunder && !hasFrozenMut) stats.missingWet++;
                    if (hasChilled) stats.chilledCount++;
                    if (!hasChilled && !hasThunder && !hasFrozenMut) stats.missingChilled++;
                    // Thunderstruck only lands on slots with no weather mutation at all (Wet/Chilled/Frozen block it).
                    if (!hasAnyWeather) stats.missingThunderstruck++;
                    if (!mutations.includes(AMBERSHINE_MUTATION))       stats.missingAmberlit++;
                    if (!mutations.includes('Dawnlit'))                 stats.missingDawnlit++;
                    if (!mutations.includes('Dawncharged'))             stats.missingDawncharged++;
                    if (!mutations.includes(AMBERSHINE_MUTATION) && !mutations.includes('Dawnlit'))           stats.missingAmberDawn++;
                    if (!mutations.includes('Dawncharged') && !mutations.includes(AMBERCHARGED_MUTATION))     stats.missingDawnAmbercharged++;
                    if (hasThunderstruck) stats.thunderstruckCount++;
                    if (hasThundercharged) stats.thunderchargedCount++;
                }
                if (isTargetSpecies && mutations.length === 0) stats.noMutations++;

                if (isTargetSpecies) {
                    let color = 1;
                    for (const m of mutations) {
                        if (m === 'Rainbow' && COLOR_MULT.Rainbow > color) color = COLOR_MULT.Rainbow;
                        if (m === 'Gold'    && COLOR_MULT.Gold    > color) color = COLOR_MULT.Gold;
                    }
                    let weather = null, time = null;
                    for (const m of mutations) {
                        if (WEATHER_MULT[m] && (!weather || WEATHER_MULT[m] > WEATHER_MULT[weather])) weather = m;
                        if (TIME_MULT[m]    && (!time    || TIME_MULT[m]    > TIME_MULT[time]))        time = m;
                    }
                    let wt = 1;
                    if (weather && time) wt = WEATHER_TIME_COMBO[`${weather}+${time}`] || Math.max(WEATHER_MULT[weather], TIME_MULT[time]);
                    else if (weather) wt = WEATHER_MULT[weather];
                    else if (time)    wt = TIME_MULT[time];
                    if (FRIEND_BONUS !== null) stats.totalFarmValue += Math.round(Math.round(color * wt) * (_getPlantSellPrice(slotSpecies) ?? 0) * (slot.targetScale || 1) * FRIEND_BONUS);
                }
            });
        });

        // Double Harvest & Crop Refund multipliers — best 3 available pets each
        function getPetStr(p) {
            const ms = asPetMaxScale(p.petSpecies);
            const xl = asPetXpPerLevel(p.petSpecies);
            if (!ms || !xl) return 87;
            const xpComp    = Math.min(Math.floor((p.xp || 0) / xl), 30);
            const scaleComp = Math.floor((((p.targetScale || 1) - 1) / (ms - 1)) * 20 + 80) - 30;
            return xpComp + scaleComp;
        }
        const doubleHarvestStrs = allAvailablePets
            .filter(p => p.hunger > 0 && (p.abilities || []).includes('DoubleHarvest'))
            .map(p => getPetStr(p))
            .sort((a, b) => b - a)
            .slice(0, 3);
        const P_double = doubleHarvestStrs.reduce((s, str) => s + 0.05 * str / 100, 0);
        const doubleHarvestMult = 1 + P_double;

        const refundStrs = allAvailablePets
            .filter(p => p.hunger > 0 && (p.abilities || []).includes('ProduceRefund'))
            .map(p => getPetStr(p))
            .sort((a, b) => b - a)
            .slice(0, 3);
        const P_refund = refundStrs.reduce((sum, str) => sum + 0.20 * str / 100, 0);
        const cropRefundMult = P_refund < 0.9999 ? 1 / (1 - P_refund) : 10000;

        stats.totalFarmValue = Math.round(stats.totalFarmValue * doubleHarvestMult * cropRefundMult);

        const timeRemaining = Math.max(0, stats.maxEndTime - currentTime);
        const remainingRealMinutes = timeRemaining / (1000 * 60);

        if (stats.notMature === 0) {
            stats.timeUntilMature = 'All mature!';
        } else if (hasTurtleBoost) {
            const effectiveRate = turtleExpectations.expectedMinutesRemoved + 1;
            const boostedMinutes = remainingRealMinutes / effectiveRate;
            stats.timeUntilMature = `${Math.floor(boostedMinutes / 60)}h ${Math.floor(boostedMinutes % 60)}m 🐢`;
        } else {
            stats.timeUntilMature = `${Math.floor(remainingRealMinutes / 60)}h ${Math.floor(remainingRealMinutes % 60)}m`;
        }

        if (stats.notMature > 0 && stats.readyNow === 0) {
            const firstTimeRemaining = Math.max(0, stats.minEndTime - currentTime);
            const firstRealMinutes = firstTimeRemaining / (1000 * 60);
            if (hasTurtleBoost) {
                const effectiveRate = turtleExpectations.expectedMinutesRemoved + 1;
                const bm = firstRealMinutes / effectiveRate;
                stats.timeUntilFirst = `${Math.floor(bm / 60)}h ${Math.floor(bm % 60)}m 🐢`;
            } else {
                stats.timeUntilFirst = `${Math.floor(firstRealMinutes / 60)}h ${Math.floor(firstRealMinutes % 60)}m`;
            }
        } else {
            stats.timeUntilFirst = null;
        }

        // Boosts until max size
        const scaleBoostStrs = allAvailablePets
            .filter(p => (p.abilities || []).some(a => a === 'ProduceScaleBoostII' || a === 'Crop Size Boost II'))
            .map(p => {
                const ms = asPetMaxScale(p.petSpecies);
                const xpl = asPetXpPerLevel(p.petSpecies);
                if (!ms || !xpl) return null;
                return Math.min(Math.floor((p.xp || 0) / xpl), 30) + Math.floor((((p.targetScale || 1) - 1) / (ms - 1)) * 20 + 80) - 30;
            })
            .filter(s => s !== null)
            .sort((a, b) => b - a)
            .slice(0, 3);
        const avgStr = scaleBoostStrs.length ? scaleBoostStrs.reduce((a, b) => a + b, 0) / scaleBoostStrs.length : 87;
        const boostMultiplier = 1 + avgStr / 1000;

        // Crop-size granters boost the whole garden, so count boosts needed across all plant slots.
        function countBoostsToMax(multiplier, capPerSlot, trackedOnly) {
            let maxBoostsNeeded = 0;
            Object.values(tileObjects).forEach(tile => {
                if (tile.objectType !== 'plant' || !tile.slots?.length) return;
                tile.slots.forEach(slot => {
                    if (ignorePreserved && slot.preserved === true) return;
                    const slotSpecies = slot.species || tile.species;
                    if (trackedOnly && !trackedSpecies.includes(slotSpecies)) return;
                    const maxScale = _getPlantMaxScale(slotSpecies);
                    if (!maxScale) return;
                    let s = slot.targetScale || 1;
                    if (s >= maxScale) return;
                    let boosts = 0;
                    while (s < maxScale) { s *= multiplier; boosts++; if (boosts > capPerSlot) break; }
                    if (boosts > maxBoostsNeeded) maxBoostsNeeded = boosts;
                });
            });
            return maxBoostsNeeded;
        }

        stats.boostsUntilMaxSize = countBoostsToMax(boostMultiplier, 20);

        const beeBoostStrs = allAvailablePets
            .filter(p => (p.abilities || []).some(a => a === 'ProduceScaleBoost'))
            .map(p => {
                const ms = asPetMaxScale(p.petSpecies);
                const xpl = asPetXpPerLevel(p.petSpecies);
                if (!ms || !xpl) return null;
                return Math.min(Math.floor((p.xp || 0) / xpl), 30) + Math.floor((((p.targetScale || 1) - 1) / (ms - 1)) * 20 + 80) - 30;
            })
            .filter(s => s !== null)
            .sort((a, b) => b - a)
            .slice(0, 3);
        const avgBeeStr = beeBoostStrs.length ? beeBoostStrs.reduce((a, b) => a + b, 0) / beeBoostStrs.length : 87;
        const beeBoostMultiplier = 1 + 0.06 * avgBeeStr / 100;

        stats.boostsUntilMaxSizeBee = countBoostsToMax(beeBoostMultiplier, 200);

        // Finish the whole-garden pool, then swap in the tracked pool if the ETA scope is "tracked only".
        stats.granterPool.boosts    = stats.boostsUntilMaxSize;
        stats.granterPool.boostsBee = stats.boostsUntilMaxSizeBee;
        const granterAllGarden = mutationConfig.granterAllGarden !== false;
        if (!granterAllGarden) {
            const trackedTotalSlots = trackedSpecies.reduce((sum, s) => sum + (stats.plantCounts[s + 'Slots'] || 0), 0);
            stats.granterPool = {
                totalSlots: trackedTotalSlots,
                rainbow: stats.missingRainbow, gold: stats.missingGold, frozen: stats.missingFrozen,
                thunderstruck: stats.missingThunderstruck, wet: stats.missingWet, chilled: stats.missingChilled,
                amber: stats.missingAmber,
                boosts: countBoostsToMax(boostMultiplier, 20, true),
                boostsBee: countBoostsToMax(beeBoostMultiplier, 200, true),
            };
        }

        // Counts come from granterPool — whole garden by default, or tracked-only per the scope toggle.
        const gp = stats.granterPool;
        stats.granterETAs = {
            rainbow:    getGranterETA(activePets, 'RainbowGranter',    0.72, gp.rainbow),
            gold:       getGranterETA(activePets, 'GoldGranter',       0.72, gp.gold),
            frozen:     getGranterETA(activePets, 'FrostGranter',      6.0,  gp.frozen),
            // Thunderstruck only lands on slots with no weather mutation at all (Wet/Chilled/Frozen/
            // Thunderstruck/Thundercharged all block it), so it targets its own pool.
            thunderstruck: getGranterETA(activePets, 'ThunderstruckGranter', 5.0, gp.thunderstruck),
            // A slot can hold only one time mutation (Amberlit/Dawnlit/Amberbound/Dawnbound), so both
            // lit granters target the same pool: slots with no time mutation at all.
            amberlit:   getGranterETA(activePets, 'AmberlitGranter',   2.0,  gp.amber),
            dawnlit:    getGranterETA(activePets, 'DawnlitGranter',    2.0,  gp.amber),
            wet:         getGranterETA(activePets, 'RainDance',          10.0, gp.wet),
            chilled:     getGranterETA(activePets, 'SnowGranter',       8.0,  gp.chilled),
            cropSize:    getGranterETA(activePets, ['ProduceScaleBoostII', 'Crop Size Boost II'], 0.40, gp.boosts),
            cropSizeBee: getGranterETA(activePets, 'ProduceScaleBoost', 0.30, gp.boostsBee),
        };
        stats.trackedSpecies = trackedSpecies;
        stats.TRACKED_SPECIES_DEFAULTS = _defaults;
        stats.friendBonus = FRIEND_BONUS;
        return stats;
    }

    function _checkGranterCompletionAlarm(stats) {
        if (!getMagicCircleValue('granter_completion_alarm', false) || !stats) return;
        const gp = stats.granterPool;
        const etas = stats.granterETAs || {};
        const rows = [
            { key: 'rainbow', label: 'Rainbow', missing: gp.rainbow, total: gp.totalSlots, eta: etas.rainbow },
            { key: 'gold', label: 'Gold', missing: gp.gold, total: gp.totalSlots, eta: etas.gold },
            { key: 'frozen', label: 'Frozen', missing: gp.frozen, total: gp.totalSlots, eta: etas.frozen },
            { key: 'thunderstruck', label: 'Thunderstruck', missing: gp.thunderstruck, total: gp.totalSlots, eta: etas.thunderstruck },
            { key: 'wet', label: 'Wet', missing: gp.wet, total: gp.totalSlots, eta: etas.wet },
            { key: 'chilled', label: 'Chilled', missing: gp.chilled, total: gp.totalSlots, eta: etas.chilled },
            { key: 'amberlit', label: 'Amberlit', missing: gp.amber, total: gp.totalSlots, eta: etas.amberlit },
            { key: 'dawnlit', label: 'Dawnlit', missing: gp.amber, total: gp.totalSlots, eta: etas.dawnlit },
            { key: 'cropSize', label: 'Max Size', missing: gp.boosts, total: null, eta: etas.cropSize },
            { key: 'cropSizeBee', label: 'Bee Size', missing: gp.boostsBee, total: null, eta: etas.cropSizeBee },
        ];
        const completed = [];
        for (const row of rows) {
            const active = !!row.eta && gp.totalSlots > 0;
            if (!active || row.missing > 0) {
                _granterAlarmCompleted.delete(row.key);
                continue;
            }
            if (_granterAlarmCompleted.has(row.key)) continue;
            _granterAlarmCompleted.add(row.key);
            completed.push(row.total == null ? row.label : `${row.label} ${row.total}/${row.total}`);
        }
        if (!completed.length) return;
        _showGranterAlarmBanner(`${completed.join(' | ')} complete!`);
        _startGranterAlarmSound();
    }

    // === updatePopupContent ===
    function updatePopupContent(popup) {
        if (!popup) popup = document.getElementById('go-farm-stats-popup');
        if (!popup) return;
        const stats = getFarmStatsData();
        if (!stats) return;
        _checkGranterCompletionAlarm(stats);

        const totalSlots  = stats.trackedSpecies.reduce((sum, s) => sum + (stats.plantCounts[s + 'Slots'] || 0), 0);
        const totalPlants = stats.trackedSpecies.reduce((sum, s) => sum + (stats.plantCounts[s] || 0), 0);
        // Species rows: "9 (134)"; just the number when slots == plants.
        // The Total row spells out the units ("61 plants (247 slots)") so the
        // compact per-row format is self-explanatory.
        function plantCountLabel(plants, slots) {
            return plants > 0 && slots !== plants
                ? `${plants} <span style="color:#4a8a8a;font-weight:normal;">(${slots})</span>`
                : `${slots}`;
        }
        const totalLabel = totalPlants > 0 && totalSlots !== totalPlants
            ? `${totalPlants} <span style="color:#4a8a8a;font-weight:normal;">plants (${totalSlots} slots)</span>`
            : `${totalSlots}`;

        const plantsWasOpen = popup.querySelector('.plant-breakdown')
            ? popup.querySelector('.plant-breakdown').style.display === 'block'
            : getMagicCircleValue('farmStatsPopup_plantsOpen', localStorage.getItem('farmStatsPopup_plantsOpen') || '1') !== '0';
        const mutationsWasOpen = popup.querySelector('.mutations-breakdown')
            ? popup.querySelector('.mutations-breakdown').style.display !== 'none'
            : getMagicCircleValue('farmStatsPopup_mutationsOpen', localStorage.getItem('farmStatsPopup_mutationsOpen') || '1') !== '0';

        const rainbowGradient = 'linear-gradient(to right,#ff4444,#ff8c00,#ffd700,#4caf50,#2196f3,#9c27b0)';

        const mutConfig = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
        const combineRainbow        = !!mutConfig.combineRainbow        && !!mutConfig.rainbow   && !!mutConfig.gold;
        const combineAmberDawn      = !!mutConfig.combineAmberDawn      && !!mutConfig.amberlit  && !!mutConfig.dawnlit;
        const combineDawnAmbercharged = !!mutConfig.combineDawnAmbercharged && !!mutConfig.dawncharged && !!mutConfig.ambercharged;
        const combineFrozenThunderstruck = !!mutConfig.combineFrozenThunderstruck && !!mutConfig.frozen && !!mutConfig.thunderstruck;

        const rainbowOnlyHave       = totalSlots - stats.missingRainbow - stats.goldCount;
        const goldHave              = stats.goldCount;
        const rainbowOrGoldHave     = totalSlots - stats.missingRainbow;
        const frozenHave            = stats.frozenCount;
        const wetHave               = stats.wetCount;
        const chilledHave           = stats.chilledCount;
        const amberlitHave          = totalSlots - stats.missingAmberlit;
        const dawnlitHave           = totalSlots - stats.missingDawnlit;
        const dawnchargedHave       = totalSlots - stats.missingDawncharged;
        const amberchargedHave      = totalSlots - stats.missingAmbercharged;
        const amberDawnHave         = totalSlots - stats.missingAmberDawn;
        const dawnAmberchargedHave  = totalSlots - stats.missingDawnAmbercharged;
        const thunderstruckHave         = stats.thunderstruckCount;
        const thunderchargedHave        = stats.thunderchargedCount;
        const frozenOrThunderstruckHave = stats.frozenCount + stats.thunderstruckCount + stats.thunderchargedCount;

        function formatEtaSec(sec) {
            const totalMin = Math.round(sec / 60);
            if (totalMin < 1) return '<1m';
            const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
            if (d > 0) return `${d}d ${h}h ${m}m`;
            if (h === 0) return `${m}m`;
            return `${h}h ${m}m`;
        }

        function mutBar(label, color, have, total) {
            if (have === 0) return '';
            const pct = (have / total * 100).toFixed(1);
            return `<div style="padding:5px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:12px;color:#7ab8b8;display:flex;align-items:center;gap:7px;">
                        <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>${label}
                    </span>
                    <span style="font-size:11px;"><span style="font-weight:bold;color:${color}">${have}</span><span style="color:#444">/${total}</span></span>
                </div>
                <div style="width:100%;height:4px;background:#1a2e2e;border-radius:2px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;border-radius:2px;background:${color};"></div>
                </div></div>`;
        }

        function badMutBar(label, color, count, total) {
            if (count === 0) return '';
            const pct = (count / total * 100).toFixed(1);
            return `<div style="padding:5px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:12px;color:#7ab8b8;display:flex;align-items:center;gap:7px;">
                        <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>${label}
                    </span>
                    <span style="font-size:11px;"><span style="font-weight:bold;color:${color}">${count}</span><span style="color:#444">/${total}</span></span>
                </div>
                <div style="width:100%;height:4px;background:#1a2e2e;border-radius:2px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;border-radius:2px;background:${color};"></div>
                </div></div>`;
        }

        function etaRow(label, missing, total, eta, color = '#a78bfa', countOnly = false) {
            if (!eta) return '';
            const avgSec = Math.round(eta.meanWaitSec);
            const avgH = Math.floor(avgSec / 3600), avgM = Math.floor((avgSec % 3600) / 60), avgS = avgSec % 60;
            const avgStr = avgH > 0
                ? `${String(avgH).padStart(2,'0')}:${String(avgM).padStart(2,'0')}:${String(avgS).padStart(2,'0')}`
                : `${String(avgM).padStart(2,'0')}:${String(avgS).padStart(2,'0')}`;
            const totalStr = formatEtaSec(eta.estimatedTotalSec);
            if (missing === 0) {
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                    <span style="font-size:12px;color:#7ab8b8;display:flex;align-items:center;gap:7px;"><span style="width:6px;height:6px;border-radius:50%;background:#34d399;flex-shrink:0;display:inline-block;"></span>${label}</span>
                    <span style="font-size:11px;color:#34d399;font-weight:bold;">&#x2713; done</span></div>`;
            }
            if (countOnly) {
                return `<div style="padding:8px 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                        <span style="font-size:12px;color:#7ab8b8;display:flex;align-items:center;gap:7px;"><span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>${label}</span>
                        <span style="font-size:12px;font-weight:bold;color:${color};">${missing} <span style="font-size:10px;color:#555;font-weight:normal;">remaining</span></span>
                    </div>
                    <div style="text-align:right;font-size:10px;color:#3a6a6a;">avg ${avgStr} · ~${totalStr} total</div></div>`;
            }
            const have = total - missing;
            const pct = total > 0 ? (have / total * 100).toFixed(1) : 0;
            return `<div style="padding:8px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                    <span style="font-size:12px;color:#7ab8b8;display:flex;align-items:center;gap:7px;"><span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>${label}</span>
                    <span style="font-size:12px;font-weight:bold;color:${color};">${have}<span style="font-size:10px;color:#444;font-weight:normal;">/${total}</span></span>
                </div>
                <div style="width:100%;height:5px;background:#1a2e2e;border-radius:3px;overflow:hidden;margin-bottom:4px;">
                    <div style="width:${pct}%;height:100%;border-radius:3px;background:${color};"></div>
                </div>
                <div style="text-align:right;font-size:10px;color:#3a6a6a;">avg ${avgStr} · ~${totalStr} total</div></div>`;
        }

        let goodBars = '';
        if (combineRainbow) {
            goodBars += mutBar('Rainbow / Gold', rainbowGradient, rainbowOrGoldHave, totalSlots);
        } else {
            if (mutConfig.rainbow) goodBars += mutBar('Rainbow', rainbowGradient, rainbowOnlyHave, totalSlots);
            if (mutConfig.gold)    goodBars += mutBar('Gold', '#ffd700', goldHave, totalSlots);
        }
        if (combineFrozenThunderstruck) {
            goodBars += mutBar('Frozen / Thunder', '#7ec8e3', frozenOrThunderstruckHave, totalSlots);
        } else {
            if (mutConfig.frozen)        goodBars += mutBar('Frozen', '#7ec8e3', frozenHave, totalSlots);
            if (mutConfig.thunderstruck) goodBars += mutBar('Thunderstruck', '#ffd700', thunderstruckHave, totalSlots);
            if (mutConfig.thundercharged) goodBars += mutBar('Thundercharged', '#fbbf24', thunderchargedHave, totalSlots);
        }
        if (mutConfig.wet)     goodBars += mutBar('Wet', '#4fc3f7', wetHave, totalSlots);
        if (mutConfig.chilled) goodBars += mutBar('Chilled', '#81d4fa', chilledHave, totalSlots);
        if (combineAmberDawn) {
            goodBars += mutBar('Amberlit / Dawnlit', '#ff9a00', amberDawnHave, totalSlots);
        } else {
            if (mutConfig.amberlit) goodBars += mutBar('Amberlit', '#ff8c00', amberlitHave, totalSlots);
            if (mutConfig.dawnlit)  goodBars += mutBar('Dawnlit', '#c084e8', dawnlitHave, totalSlots);
        }
        if (combineDawnAmbercharged) {
            goodBars += mutBar('Dawnbound / Amberbound', '#e07b39', dawnAmberchargedHave, totalSlots);
        } else {
            if (mutConfig.dawncharged)  goodBars += mutBar('Dawnbound', '#a855f7', dawnchargedHave, totalSlots);
            if (mutConfig.ambercharged) goodBars += mutBar('Amberbound', '#c45e00', amberchargedHave, totalSlots);
        }
        const badBars = (mutConfig.none ? badMutBar('None', '#c084e8', stats.noMutations, totalSlots) : '');

        // ETA rows use the all-garden granter pool (granters work the whole garden, not just tracked species).
        const gp = stats.granterPool;
        const etaRows = etaRow('&#x1F308; Rainbow', gp.rainbow, gp.totalSlots, stats.granterETAs?.rainbow, rainbowGradient)
            + etaRow('&#x1FAB4; Gold', gp.gold, gp.totalSlots, stats.granterETAs?.gold, '#ffd700')
            + etaRow('&#x2744;&#xFE0F; Frozen', gp.frozen, gp.totalSlots, stats.granterETAs?.frozen, '#7ec8e3')
            + etaRow('&#x26A1; Thunderstruck', gp.thunderstruck, gp.totalSlots, stats.granterETAs?.thunderstruck, '#ffd700')
            + etaRow('&#x1F4A7; Wet', gp.wet, gp.totalSlots, stats.granterETAs?.wet, '#4fc3f7')
            + etaRow('&#x2745;&#xFE0F; Chilled', gp.chilled, gp.totalSlots, stats.granterETAs?.chilled, '#81d4fa')
            + etaRow('&#x2728; Amberlit', gp.amber, gp.totalSlots, stats.granterETAs?.amberlit, '#ff8c00')
            + etaRow('&#x1F305; Dawnlit', gp.amber, gp.totalSlots, stats.granterETAs?.dawnlit, '#c084e8')
            + etaRow('&#x1F331; Max Size', gp.boosts, null, stats.granterETAs?.cropSize, '#a78bfa', true)
            + etaRow('&#x1F41D; Bee Size', gp.boostsBee, null, stats.granterETAs?.cropSizeBee, '#a78bfa', true);
        const hasETAs = etaRows.trim() !== '';
        const granterAlarmEnabled = getMagicCircleValue('granter_completion_alarm', false);

        let growthHTML;
        if (stats.notMature === 0 && stats.notMaxSize === 0) {
            growthHTML = `<div style="font-size:12px;color:#34d399;font-weight:bold;padding:2px 0;">&#x2714; All mature &amp; max size</div>`;
        } else if (stats.notMature === 0) {
            growthHTML = `<div style="font-size:12px;color:#FFD700;padding:2px 0;">&#x26A0; All mature — <b>${stats.notMaxSize}</b> not max size</div>`;
        } else {
            const cards = [];
            cards.push(`<div style="background:#081818;border:1px solid #0f2020;border-radius:6px;padding:6px 8px;">
                <div style="font-size:9px;color:#4a8a8a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Growing</div>
                <div style="font-size:16px;font-weight:bold;color:#e6b800;line-height:1;">${stats.notMature}</div></div>`);
            if (stats.timeUntilFirst) cards.push(`<div style="background:#081818;border:1px solid #0f2020;border-radius:6px;padding:6px 8px;">
                <div style="font-size:9px;color:#4a8a8a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">First ready</div>
                <div style="font-size:12px;font-weight:bold;color:#4caf50;line-height:1.2;">${stats.timeUntilFirst}</div></div>`);
            if (stats.notMaxSize > 0) cards.push(`<div style="background:#081818;border:1px solid #0f2020;border-radius:6px;padding:6px 8px;">
                <div style="font-size:9px;color:#4a8a8a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Not max size</div>
                <div style="font-size:16px;font-weight:bold;color:#ff8c00;line-height:1;">${stats.notMaxSize}</div></div>`);
            cards.push(`<div style="background:#081818;border:1px solid #0f2020;border-radius:6px;padding:6px 8px;">
                <div style="font-size:9px;color:#4a8a8a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">All ready</div>
                <div style="font-size:12px;font-weight:bold;color:#4caf50;line-height:1.2;">${stats.timeUntilMature}</div></div>`);
            growthHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;">${cards.join('')}</div>`;
        }


        popup.innerHTML = `
            <div style="background:#0a1f1f;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;cursor:move;">
                <span style="font-size:13px;font-weight:bold;color:#a4f5f5;letter-spacing:0.03em;">&#x1F33F; Garden Overview</span>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button class="species-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure tracked plants">&#x1F33F;</button>
                    <button class="plant-focus-btn" style="background:${_getPlantFocusConfig().enabled ? 'rgba(164,245,245,0.2)' : 'rgba(255,255,255,0.08)'};border:none;color:${_getPlantFocusConfig().enabled ? '#a4f5f5' : '#7ab8b8'};cursor:pointer;font-size:14px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure plant focus">&#x25D0;</button>
                    <button class="mut-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure tracked mutations">&#x1F527;</button>
                    <button class="keybind-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure keybind">&#x2328;</button>
                    <button class="zoom-toggle-btn" style="background:${getMagicCircleValue('farm_stats_zoom', 1) !== 1 ? 'rgba(164,245,245,0.2)' : 'rgba(255,255,255,0.08)'};border:none;color:#7ab8b8;cursor:pointer;font-size:8px;border-radius:4px;width:32px;height:24px;line-height:1;font-family:monospace;" title="Cycle zoom">${getMagicCircleValue('farm_stats_zoom', 1)}×</button>
                    <button class="close-farm-stats-btn" style="background:#c0392b;color:white;border:none;border-radius:4px;width:24px;height:24px;font-size:12px;cursor:pointer;">&#x2715;</button>
                </div>
            </div>

            <div style="padding:12px 16px;border-bottom:1px solid #1a2a2a;">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                    Growth <span style="flex:1;height:1px;background:#1e3a3a;display:block;"></span>
                </div>
                ${growthHTML}
            </div>

            ${hasETAs ? `
            <div style="padding:12px 16px;border-bottom:1px solid #1a2a2a;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;">Mutation Estimates</div>
                    <button class="granter-alarm-toggle" title="${granterAlarmEnabled ? 'Disable' : 'Enable'} completion alarm" aria-label="${granterAlarmEnabled ? 'Disable' : 'Enable'} granter completion alarm" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:5px;cursor:pointer;font-size:14px;line-height:1;background:${granterAlarmEnabled ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)'};border:1px solid ${granterAlarmEnabled ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.1)'};color:${granterAlarmEnabled ? '#fbbf24' : '#4a6868'};">${granterAlarmEnabled ? '&#x1F514;' : '&#x1F515;'}</button>
                </div>
                ${etaRows}
            </div>` : ''}

            <div style="padding:10px 16px;border-bottom:1px solid #1a2a2a;">
                <div class="mutations-toggle-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;display:flex;align-items:center;gap:6px;">
                        Mutations <span style="flex:1;height:1px;background:#1e3a3a;display:block;"></span>
                    </div>
                    <span class="mutations-toggle-arrow" style="color:#4a8a8a;font-size:10px;">${mutationsWasOpen ? '&#x25BE;' : '&#x25B8;'}</span>
                </div>
                <div class="mutations-breakdown" style="display:${mutationsWasOpen ? 'block' : 'none'};margin-top:6px;">
                    ${goodBars}${badBars}
                </div>
            </div>

            <div style="padding:10px 16px;border-bottom:1px solid #1a2a2a;">
                <div class="plant-toggle-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;display:flex;align-items:center;gap:6px;">
                        Plants <span style="flex:1;height:1px;background:#1e3a3a;display:block;"></span>
                    </div>
                    <span class="plant-toggle-arrow" style="color:#4a8a8a;font-size:10px;">${plantsWasOpen ? '&#x25BE;' : '&#x25B8;'}</span>
                </div>
                <div class="plant-breakdown" style="display:${plantsWasOpen ? 'block' : 'none'};margin-top:6px;padding-left:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:2px 0;margin-bottom:2px;">
                        <span style="color:#7ab8b8;">Total</span>
                        <span style="color:#7ab8b8;font-weight:bold;">${totalLabel}</span>
                    </div>
                    ${stats.trackedSpecies.filter(s => (stats.plantCounts[s + 'Slots'] || 0) > 0).map(s =>
                        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;"><span style="color:#7ab8b8;">${s}</span><span style="color:#7ab8b8;">${plantCountLabel(stats.plantCounts[s] || 0, stats.plantCounts[s + 'Slots'] || 0)}</span></div>`
                    ).join('')}
                </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#0a1f1f;border-top:1px solid #1e3a3a;">
                <span style="font-size:11px;color:#4a8a8a;">Est. value &nbsp;${stats.friendBonus !== null ? `<span style="font-size:10px;background:#1e3a3a;color:#4a8a8a;padding:1px 6px;border-radius:3px;">+${Math.round((stats.friendBonus - 1) * 100)}% bonus</span>` : `<span style="font-size:10px;background:#1e3a3a;color:#4a8a8a;padding:1px 6px;border-radius:3px;">bonus unknown</span>`}</span>
                <span style="font-size:20px;font-weight:bold;color:#ffd84d;">${stats.friendBonus !== null ? formatFarmValue(stats.totalFarmValue) : '—'}</span>
            </div>
        `;

        // Apply saved zoom state
        const _ZOOM_CYCLE = [1, 1.25, 1.5];
        const _currentZoom = getMagicCircleValue('farm_stats_zoom', 1);
        popup.style.transform       = _currentZoom !== 1 ? 'scale(' + _currentZoom + ')' : '';
        popup.style.transformOrigin = 'top left';

        popup.querySelector('.granter-alarm-toggle')?.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const enabled = !getMagicCircleValue('granter_completion_alarm', false);
            setMagicCircleValue('granter_completion_alarm', enabled);
            _granterAlarmCompleted.clear();
            if (enabled) {
                _getGranterAlarmAudioCtx();
                _checkGranterCompletionAlarm(stats);
            } else {
                _stopGranterAlarm();
            }
            updatePopupContent(popup);
        });

        popup.querySelector('.zoom-toggle-btn').onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            const cur  = getMagicCircleValue('farm_stats_zoom', 1);
            const idx  = _ZOOM_CYCLE.indexOf(cur);
            const next = _ZOOM_CYCLE[(idx === -1 ? 0 : idx + 1) % _ZOOM_CYCLE.length];
            setMagicCircleValue('farm_stats_zoom', next);
            popup.style.transform = next !== 1 ? 'scale(' + next + ')' : '';
            const btn = popup.querySelector('.zoom-toggle-btn');
            btn.textContent      = next + '×';
            btn.style.background = next !== 1 ? 'rgba(164,245,245,0.2)' : 'rgba(255,255,255,0.08)';
        };

        // Close button
        popup.querySelector('.close-farm-stats-btn').onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            if (popup.refreshInterval) clearInterval(popup.refreshInterval);
            popup._dragAbort?.abort();
            popup.remove();
            removeConfigGuis();
        };

        // Keybind config button
        popup.querySelector('.keybind-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('go-keybind-config-gui');
            if (existing) { existing._abort?.abort(); existing.remove(); return; }

            const kbGui = document.createElement('div');
            kbGui.id = 'go-keybind-config-gui';
            kbGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
            // Key-capture listener is tied to this controller so closing the GUI mid-capture can't leak it
            const kbAbort = new AbortController();
            kbGui._abort = kbAbort;

            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;';
            hdr.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;">&#x2328; Keybind</span>';
            const closebtn = document.createElement('button'); closebtn.textContent = '✕';
            closebtn.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;';
            closebtn.onclick = () => { kbAbort.abort(); kbGui.remove(); };
            hdr.appendChild(closebtn);
            kbGui.appendChild(hdr);

            const body = document.createElement('div');
            body.style.cssText = 'padding:10px 12px;display:flex;flex-direction:column;gap:8px;';

            function formatKeybind(kb) {
                if (!kb?.key) return '— not set —';
                const parts = [];
                if (kb.ctrl)  parts.push('Ctrl');
                if (kb.alt)   parts.push('Alt');
                if (kb.shift) parts.push('Shift');
                parts.push(kb.key);
                return parts.join('+');
            }

            // Key capture

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;';

            const keybindBtn = document.createElement('button');
            keybindBtn.textContent = formatKeybind(_keybind);
            keybindBtn.style.cssText = 'flex:1;padding:4px 8px;border-radius:6px;border:1px solid #2a6a6a;background:#0f3a3a;color:#a4f5f5;font-size:12px;cursor:pointer;font-family:monospace;text-align:center;';
            keybindBtn.title = 'Click then press a key';

            const clearBtn = document.createElement('button');
            clearBtn.textContent = '✕';
            clearBtn.style.cssText = 'padding:4px 7px;border-radius:6px;border:1px solid #5a2a2a;background:#3a0f0f;color:#f55a5a;font-size:11px;cursor:pointer;font-family:monospace;';
            clearBtn.title = 'Clear keybind';

            const MODIFIER_KEYS = new Set(['Control','Alt','Shift','Meta','AltGraph']);
            let _kbListening = false, _kbHandler = null;
            keybindBtn.addEventListener('click', function() {
                if (_kbListening) return;
                _kbListening = true;
                keybindBtn.textContent = 'Press a key…';
                keybindBtn.style.background = '#1a4a1a';
                keybindBtn.style.borderColor = '#4a8a4a';
                _kbHandler = function(ev) {
                    if (MODIFIER_KEYS.has(ev.key)) return;
                    ev.preventDefault(); ev.stopPropagation();
                    if (ev.key !== 'Escape') {
                        _keybind = { key: ev.key, ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey };
                        setMagicCircleValue('keybind', _keybind);
                        keybindBtn.textContent = formatKeybind(_keybind);
                    } else {
                        keybindBtn.textContent = formatKeybind(_keybind);
                    }
                    keybindBtn.style.background = '#0f3a3a';
                    keybindBtn.style.borderColor = '#2a6a6a';
                    _kbListening = false;
                    document.removeEventListener('keydown', _kbHandler, true);
                    _kbHandler = null;
                };
                document.addEventListener('keydown', _kbHandler, { capture: true, signal: kbAbort.signal });
            });
            clearBtn.addEventListener('click', function() {
                _keybind = null;
                setMagicCircleValue('keybind', null);
                keybindBtn.textContent = '— not set —';
                if (_kbHandler) { document.removeEventListener('keydown', _kbHandler, true); _kbHandler = null; _kbListening = false; }
            });

            row.appendChild(keybindBtn);
            row.appendChild(clearBtn);
            body.appendChild(row);

            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:9px;color:#3a6a6a;';
            hint.textContent = 'Hold modifiers + press key to bind. Esc cancels.';
            body.appendChild(hint);

            kbGui.appendChild(body);
            document.body.appendChild(kbGui);
            kbGui.style.left = Math.round((window.innerWidth  - kbGui.offsetWidth)  / 2) + 'px';
            kbGui.style.top  = Math.round((window.innerHeight - kbGui.offsetHeight) / 2) + 'px';
            _makeConfigGuiDraggable(kbGui, hdr);
        });

        // Mutations toggle
        popup.querySelector('.mutations-toggle-header').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const bd = popup.querySelector('.mutations-breakdown');
            const ar = popup.querySelector('.mutations-toggle-arrow');
            bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
            ar.textContent = bd.style.display === 'block' ? '▾' : '▸';
            setMagicCircleValue('farmStatsPopup_mutationsOpen', bd.style.display === 'block' ? '1' : '0');
        });

        // Plants toggle
        popup.querySelector('.plant-toggle-header').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const bd = popup.querySelector('.plant-breakdown');
            const ar = popup.querySelector('.plant-toggle-arrow');
            bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
            ar.textContent = bd.style.display === 'block' ? '▾' : '▸';
            setMagicCircleValue('farmStatsPopup_plantsOpen', bd.style.display === 'block' ? '1' : '0');
        });

        // Plant focus config button
        popup.querySelector('.plant-focus-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            showPlantFocusConfig(popup);
        });

        // Species config button
        popup.querySelector('.species-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('go-species-config-gui');
            if (existing) { existing.remove(); return; }

            const defaults = stats.TRACKED_SPECIES_DEFAULTS;
            const allSpecies = Object.keys(defaults).sort((a, b) => a.localeCompare(b));
            const gardenCounts = _getGardenSpeciesCounts();
            let filter = '';

            const speciesGui = document.createElement('div');
            speciesGui.id = 'go-species-config-gui';
            speciesGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:270px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
            speciesGui.appendChild(_makeConfigStyle('go-species-config-gui'));

            const config = () => Object.assign({}, defaults, getMagicCircleValue('tracked_species', null) || {});
            const save = (c) => { setMagicCircleValue('tracked_species', c); _applyPlantFocusFade(); updatePopupContent(popup); };

            // Header (title + live count + close)
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;flex:0 0 auto;';
            const title = document.createElement('span');
            title.style.cssText = 'font-size:11px;font-weight:bold;color:#a4f5f5;letter-spacing:0.03em;';
            const cb = document.createElement('button'); cb.textContent = '✕';
            cb.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;flex:0 0 auto;';
            cb.onclick = () => speciesGui.remove();
            hdr.appendChild(title); hdr.appendChild(cb); speciesGui.appendChild(hdr);

            // Toolbar (search + bulk actions)
            const toolbar = document.createElement('div');
            toolbar.style.cssText = 'padding:8px 10px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid #1a2a2a;flex:0 0 auto;';
            const search = document.createElement('input');
            search.type = 'text'; search.placeholder = '🔍 search plants…'; search.className = 'go-sp-search';
            search.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 9px;border-radius:7px;border:1px solid #1e3a3a;background:#061414;color:#d6f7f7;font-size:11px;font-family:monospace;outline:none;transition:border-color .12s ease;';
            search.addEventListener('input', () => { filter = search.value; renderBody(); });
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:5px;';
            const mkAction = (label, fn) => {
                const b = document.createElement('button');
                b.textContent = label; b.className = 'go-sp-action'; b.onclick = fn;
                return b;
            };
            btnRow.appendChild(mkAction('All', () => { const c = config(); allSpecies.forEach(s => c[s] = true); save(c); renderBody(); }));
            btnRow.appendChild(mkAction('None', () => { const c = config(); allSpecies.forEach(s => c[s] = false); save(c); renderBody(); }));
            btnRow.appendChild(mkAction('Track owned', () => { const c = config(); gardenCounts.forEach((_n, s) => { if (s in defaults) c[s] = true; }); save(c); renderBody(); }));
            toolbar.appendChild(search); toolbar.appendChild(btnRow); speciesGui.appendChild(toolbar);

            // Scrollable body (sections)
            const body = document.createElement('div');
            body.style.cssText = 'padding:8px 10px;overflow-y:auto;flex:1 1 auto;';
            speciesGui.appendChild(body);

            function pill(key, on) {
                const count = gardenCounts.get(key);
                const btn = document.createElement('button');
                btn.className = 'go-sp-pill' + (on ? ' on' : '');
                btn.innerHTML = (on ? '<span class="go-sp-check">&#x2713;</span>' : '')
                    + `<span>${key}</span>`
                    + (count ? ` <span class="go-sp-count">&middot;${count}</span>` : '');
                btn.onclick = () => { const c = config(); c[key] = !c[key]; save(c); renderBody(); };
                return btn;
            }

            function section(label, list, c) {
                if (!list.length) return;
                const lbl = document.createElement('div');
                lbl.className = 'go-sp-section'; lbl.textContent = label;
                body.appendChild(lbl);
                const wrap = document.createElement('div');
                wrap.className = 'go-sp-wrap';
                list.forEach(s => wrap.appendChild(pill(s, !!c[s])));
                body.appendChild(wrap);
            }

            function renderBody() {
                const c = config();
                const trackedCount = allSpecies.filter(s => c[s]).length;
                title.innerHTML = `&#x1F33F; Tracked Plants <span style="color:#4a8a8a;font-weight:normal;">(${trackedCount})</span>`;
                const f = filter.trim().toLowerCase();
                const match = (s) => !f || s.toLowerCase().includes(f);
                const tracked = allSpecies.filter(s => c[s] && match(s));
                const ownedUntracked = allSpecies.filter(s => !c[s] && gardenCounts.has(s) && match(s));
                const rest = allSpecies.filter(s => !c[s] && !gardenCounts.has(s) && match(s));
                body.innerHTML = '';
                section(`★ Tracked (${tracked.length})`, tracked, c);
                section('🌱 In your garden', ownedUntracked, c);
                section('All plants', rest, c);
                if (!tracked.length && !ownedUntracked.length && !rest.length) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'font-size:10px;color:#4a8a8a;padding:10px 2px;';
                    empty.textContent = 'No plants match your search.';
                    body.appendChild(empty);
                }
            }

            renderBody();
            document.body.appendChild(speciesGui);
            speciesGui.style.left = Math.round((window.innerWidth  - speciesGui.offsetWidth)  / 2) + 'px';
            speciesGui.style.top  = Math.round((window.innerHeight - speciesGui.offsetHeight) / 2) + 'px';
            _makeConfigGuiDraggable(speciesGui, hdr);
        });

        // Mutation config button
        popup.querySelector('.mut-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('go-mut-config-gui');
            if (existing) { existing.remove(); return; }

            const cfgGui = document.createElement('div');
            cfgGui.id = 'go-mut-config-gui';
            cfgGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:240px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
            cfgGui.appendChild(_makeConfigStyle('go-mut-config-gui'));

            const config = () => Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
            const save = (c) => { setMagicCircleValue('mutation_tracking', c); updatePopupContent(popup); };

            // Header
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;flex:0 0 auto;';
            hdr.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;letter-spacing:0.03em;">&#x1F527; Mutation Config</span>';
            const cb = document.createElement('button'); cb.textContent = '✕';
            cb.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;flex:0 0 auto;';
            cb.onclick = () => cfgGui.remove();
            hdr.appendChild(cb); cfgGui.appendChild(hdr);

            // Scrollable body
            const body = document.createElement('div');
            body.style.cssText = 'padding:10px 12px;overflow-y:auto;flex:1 1 auto;';
            cfgGui.appendChild(body);

            function pill(key, label, on) {
                const btn = document.createElement('button');
                btn.className = 'go-sp-pill' + (on ? ' on' : '');
                btn.innerHTML = (on ? '<span class="go-sp-check">&#x2713;</span>' : '') + `<span>${label}</span>`;
                btn.onclick = () => { const c = config(); c[key] = !c[key]; save(c); renderBody(); };
                return btn;
            }

            function section(label, pairs, c) {
                const lbl = document.createElement('div');
                lbl.className = 'go-sp-section'; lbl.textContent = label;
                body.appendChild(lbl);
                const wrap = document.createElement('div');
                wrap.className = 'go-sp-wrap';
                pairs.forEach(([key, label2]) => wrap.appendChild(pill(key, label2, !!c[key])));
                body.appendChild(wrap);
            }

            function renderBody() {
                const c = config();
                body.innerHTML = '';
                section('Color', [['rainbow','Rainbow'],['gold','Gold']], c);
                section('Weather', [['frozen','Frozen'],['thunderstruck','Thunderstruck'],['thundercharged','Thundercharged'],['wet','Wet'],['chilled','Chilled']], c);
                section('Time', [['amberlit','Amberlit'],['dawnlit','Dawnlit'],['dawncharged','Dawnbound'],['ambercharged','Amberbound']], c);
                section('Other', [['none','None']], c);
                section('Combine Bars', [
                    ['combineRainbow','Rainbow+Gold'],['combineAmberDawn','Amberlit+Dawnlit'],
                    ['combineDawnAmbercharged','Dawnbound+Amberbound'],['combineFrozenThunderstruck','Frozen+Thunderstruck']
                ], c);
                // Estimates scope: on = whole garden (granters act on all crops); off = tracked species only.
                section('Estimate Scope', [['granterAllGarden','Whole garden'],['ignorePreserved','Ignore preserved']], c);
            }

            renderBody();
            document.body.appendChild(cfgGui);
            cfgGui.style.left = Math.round((window.innerWidth  - cfgGui.offsetWidth)  / 2) + 'px';
            cfgGui.style.top  = Math.round((window.innerHeight - cfgGui.offsetHeight) / 2) + 'px';
            _makeConfigGuiDraggable(cfgGui, hdr);
        });
    }

    // === showFarmStatsPopup ===
    function showFarmStatsPopup() {
        const existing = document.getElementById('go-farm-stats-popup');
        if (existing) {
            if (existing.refreshInterval) clearInterval(existing.refreshInterval);
            existing._dragAbort?.abort();
            existing.remove();
            removeConfigGuis();
            return;
        }

        if (!state.atoms.playerSlot) {
            console.log('[GardenOverview] Not ready yet.');
            return;
        }

        const popup = document.createElement('div');
        popup.id = 'go-farm-stats-popup';
        popup.style.cssText = `
            position: fixed;
            background: #0d1117;
            color: #e0e0e0;
            border-radius: 12px;
            font-family: monospace;
            z-index: 30000;
            min-width: 300px;
            max-width: 380px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            border: 1px solid #1e3a3a;
        `;
        document.body.appendChild(popup);
        updatePopupContent(popup);

        // Restore saved position or centre
        const savedPopupPos = getMagicCircleValue('go_popup_position', null);
        if (savedPopupPos) {
            popup.style.left = savedPopupPos.left;
            popup.style.top  = savedPopupPos.top;
            // Clamp to the current viewport — a position saved on a bigger window can be fully off-screen
            const rect = popup.getBoundingClientRect();
            popup.style.left = Math.max(0, Math.min(window.innerWidth  - rect.width,  rect.left)) + 'px';
            popup.style.top  = Math.max(0, Math.min(window.innerHeight - rect.height, rect.top))  + 'px';
        } else {
            popup.style.left = Math.round((window.innerWidth  - popup.offsetWidth)  / 2) + 'px';
            popup.style.top  = Math.round((window.innerHeight - popup.offsetHeight) / 2) + 'px';
        }

        // Drag logic — listeners scoped to an AbortController so they clean up on close
        let dragging = false, dragOffX, dragOffY;
        const dragAbort = new AbortController();
        popup._dragAbort = dragAbort;
        const { signal } = dragAbort;
        popup.addEventListener('mousedown', function(e) {
            const header = popup.firstElementChild;
            if (!header || !header.contains(e.target)) return;
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            dragOffX = e.clientX - popup.getBoundingClientRect().left;
            dragOffY = e.clientY - popup.getBoundingClientRect().top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!dragging) return;
            // getBoundingClientRect includes the zoom scale; offsetWidth/Height would not
            const rect = popup.getBoundingClientRect();
            const maxLeft = window.innerWidth  - rect.width;
            const maxTop  = window.innerHeight - rect.height;
            popup.style.left = Math.max(0, Math.min(maxLeft, e.clientX - dragOffX)) + 'px';
            popup.style.top  = Math.max(0, Math.min(maxTop,  e.clientY - dragOffY)) + 'px';
        }, { signal });
        document.addEventListener('mouseup', function() {
            if (dragging) setMagicCircleValue('go_popup_position', { left: popup.style.left, top: popup.style.top });
            dragging = false;
        }, { signal });

        popup.refreshInterval = setInterval(() => {
            if (!document.getElementById('go-farm-stats-popup')) { clearInterval(popup.refreshInterval); return; }
            updatePopupContent(popup);
        }, 5000);
    }

    // === Trigger button ===
    function createTriggerButton() {
        console.log('[GardenOverview] createTriggerButton called, document.body:', !!document.body);
        if (document.getElementById('go-trigger')) return;
        const btn = document.createElement('button');
        btn.id = 'go-trigger';
        btn.innerHTML = '&#x1F33F;';
        btn.title = 'Garden Overview';
        btn.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            z-index: 10000;
            background: rgba(0,0,0,0.75);
            color: #a4f5f5;
            border: 1px solid #1e3a3a;
            border-radius: 8px;
            width: 32px;
            height: 32px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        btn.onclick = showFarmStatsPopup;
        document.body.appendChild(btn);
        console.log('[GardenOverview] Trigger button added to page');
    }

    // === Keybind listener ===
    _keybind = getMagicCircleValue('keybind', null);
    if (typeof _keybind === 'string') _keybind = { key: _keybind, ctrl: false, alt: false, shift: false };
    document.addEventListener('keydown', function(e) {
        if (!_keybind?.key) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === _keybind.key &&
            e.ctrlKey  === !!_keybind.ctrl &&
            e.altKey   === !!_keybind.alt &&
            e.shiftKey === !!_keybind.shift) {
            e.preventDefault();
            showFarmStatsPopup();
        }
    });

    // === Init ===
    console.log('[GardenOverview] Init, document.readyState:', document.readyState, '| document.body:', !!document.body);
    initWsState();
    setInterval(() => {
        if (getMagicCircleValue('granter_completion_alarm', false)) {
            _checkGranterCompletionAlarm(getFarmStatsData());
        }
    }, 5000);

    if (document.body) {
        createTriggerButton();
    } else {
        console.log('[GardenOverview] Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[GardenOverview] DOMContentLoaded fired');
            createTriggerButton();
        });
    }

})();
