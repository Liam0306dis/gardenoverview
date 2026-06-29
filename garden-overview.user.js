// ==UserScript==
// @name         Garden Overview
// @namespace    http://tampermonkey.net/
// @version      1.30
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
    const hookedAtoms = new Set();

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

    // === Atom hooks ===
    function hookAtom(atomPath, key, retryCount = 0) {
        const hookKey = atomPath + '_' + key;
        if (hookedAtoms.has(hookKey)) return;

        const atomCache = targetWindow.jotaiAtomCache?.cache || targetWindow.jotaiAtomCache;
        const atom = atomCache?.get?.(atomPath);

        if (!atom || typeof atom.read !== 'function') {
            if (retryCount < 60) setTimeout(() => hookAtom(atomPath, key, retryCount + 1), 500);
            else console.warn('[GardenOverview] Gave up hooking atom after 30s:', key);
            return;
        }

        hookedAtoms.add(hookKey);
        const originalRead = atom.read;
        atom.read = function(get) {
            const value = originalRead.call(this, get);
            if (!(key in state.atoms)) {
                let preview;
                try { preview = JSON.stringify(value)?.slice(0, 300); } catch(err) { preview = '<unserializable>'; }
                console.log('[GardenOverview] Atom captured:', key, '→', preview);
            }
            state.atoms[key] = value;
            return value;
        };
    }

    function initAtomHooks() {
        const atoms = [
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/baseAtoms.ts/myUserSlotAtom',              'playerSlot'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/myAtoms.ts/myPrimitivePetSlotsAtom',        'activePets'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myInventoryAtom',         'inventory'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/miscAtoms.ts/numFriendsInRoomAtom',         'numFriendsInRoom'],
        ];

        console.log('[GardenOverview] Waiting for jotaiAtomCache...');
        const hookAll = () => atoms.forEach(([path, key]) => hookAtom(path, key));
        const interval = setInterval(() => {
            const cache = targetWindow.jotaiAtomCache?.cache || targetWindow.jotaiAtomCache;
            if (cache?.size > 0) {
                console.log('[GardenOverview] jotaiAtomCache found, size:', cache.size, '- hooking atoms');
                hookAll();
                clearInterval(interval);
            }
        }, 500);
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
        combineFrozenThunderstruck: false
    };

    // === Helpers ===
    function removeConfigGuis() {
        ['go-mut-config-gui', 'go-species-config-gui', 'go-keybind-config-gui'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) { el._abort?.abort(); el.remove(); }
        });
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
            granterPool: { totalSlots: 0, rainbow: 0, gold: 0, frozen: 0, thunderstruck: 0, wet: 0, chilled: 0, amber: 0 },
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

            if (trackedSpecies.includes(tile.species)) {
                stats.plantCounts[tile.species] = (stats.plantCounts[tile.species] || 0) + 1;
            }

            tile.slots.forEach((slot, slotIndex) => {
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
        function countBoostsToMax(multiplier, capPerSlot) {
            let maxBoostsNeeded = 0;
            Object.values(tileObjects).forEach(tile => {
                if (tile.objectType !== 'plant' || !tile.slots?.length) return;
                tile.slots.forEach(slot => {
                    const slotSpecies = slot.species || tile.species;
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

        // Counts come from granterPool (all garden slots), since granters act on the whole garden.
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
            cropSize:    getGranterETA(activePets, ['ProduceScaleBoostII', 'Crop Size Boost II'], 0.40, stats.boostsUntilMaxSize),
            cropSizeBee: getGranterETA(activePets, 'ProduceScaleBoost', 0.30, stats.boostsUntilMaxSizeBee),
        };
        stats.trackedSpecies = trackedSpecies;
        stats.TRACKED_SPECIES_DEFAULTS = _defaults;
        stats.friendBonus = FRIEND_BONUS;
        return stats;
    }

    // === updatePopupContent ===
    function updatePopupContent(popup) {
        if (!popup) popup = document.getElementById('go-farm-stats-popup');
        if (!popup) return;
        const stats = getFarmStatsData();
        if (!stats) return;

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
            + etaRow('&#x1F331; Max Size', stats.boostsUntilMaxSize, null, stats.granterETAs?.cropSize, '#a78bfa', true)
            + etaRow('&#x1F41D; Bee Size', stats.boostsUntilMaxSizeBee, null, stats.granterETAs?.cropSizeBee, '#a78bfa', true);
        const hasETAs = etaRows.trim() !== '';

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
                    <button class="mut-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure tracked mutations">&#x2699;</button>
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
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;margin-bottom:4px;">Mutation Estimates</div>
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

        // Species config button
        popup.querySelector('.species-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('go-species-config-gui');
            if (existing) { existing.remove(); return; }

            const speciesGui = document.createElement('div');
            speciesGui.id = 'go-species-config-gui';
            speciesGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:230px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

            function buildSpeciesPill(key, cfg) {
                const on = !!cfg[key];
                const btn = document.createElement('button');
                btn.className = 'go-species-pill'; btn.setAttribute('data-key', key); btn.textContent = key;
                btn.style.cssText = 'padding:2px 6px;border-radius:10px;border:1px solid ' + (on ? '#2a6a6a' : '#1a3a3a') + ';background:' + (on ? '#0f3a3a' : '#061414') + ';color:' + (on ? '#a4f5f5' : '#4a8a8a') + ';font-size:9px;cursor:pointer;font-family:monospace;white-space:nowrap;';
                return btn;
            }

            function renderSpeciesGui() {
                const c = Object.assign({}, stats.TRACKED_SPECIES_DEFAULTS, getMagicCircleValue('tracked_species', null) || {});
                speciesGui.innerHTML = '';
                const hdr = document.createElement('div');
                hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;';
                hdr.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;">&#x1F33F; Tracked Plants</span>';
                const cb = document.createElement('button'); cb.textContent = '✕';
                cb.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;';
                cb.onclick = () => speciesGui.remove();
                hdr.appendChild(cb); speciesGui.appendChild(hdr);
                const body = document.createElement('div');
                body.style.cssText = 'padding:8px 10px;max-height:70vh;overflow-y:auto;';
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
                Object.keys(stats.TRACKED_SPECIES_DEFAULTS).forEach(key => wrap.appendChild(buildSpeciesPill(key, c)));
                body.appendChild(wrap); speciesGui.appendChild(body);
                speciesGui.querySelectorAll('.go-species-pill').forEach(pill => {
                    pill.addEventListener('click', function(ev) {
                        ev.preventDefault(); ev.stopPropagation();
                        const latest = Object.assign({}, stats.TRACKED_SPECIES_DEFAULTS, getMagicCircleValue('tracked_species', null) || {});
                        latest[pill.getAttribute('data-key')] = !latest[pill.getAttribute('data-key')];
                        setMagicCircleValue('tracked_species', latest);
                        renderSpeciesGui(); updatePopupContent(popup);
                    });
                });
            }
            renderSpeciesGui();
            document.body.appendChild(speciesGui);
            speciesGui.style.left = Math.round((window.innerWidth  - speciesGui.offsetWidth)  / 2) + 'px';
            speciesGui.style.top  = Math.round((window.innerHeight - speciesGui.offsetHeight) / 2) + 'px';
        });

        // Mutation config button
        popup.querySelector('.mut-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('go-mut-config-gui');
            if (existing) { existing.remove(); return; }

            const cfgGui = document.createElement('div');
            cfgGui.id = 'go-mut-config-gui';
            cfgGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

            function buildPill(key, cfg) {
                const on = cfg[key] !== false;
                const btn = document.createElement('button');
                btn.className = 'go-mut-cfg-pill'; btn.setAttribute('data-key', key); btn.textContent = key;
                btn.style.cssText = 'padding:3px 10px;border-radius:12px;border:1px solid ' + (on ? '#2a6a6a' : '#1a3a3a') + ';background:' + (on ? '#0f3a3a' : '#061414') + ';color:' + (on ? '#a4f5f5' : '#4a8a8a') + ';font-size:11px;cursor:pointer;font-family:monospace;';
                return btn;
            }

            function renderCfgGui() {
                const c = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
                cfgGui.innerHTML = '';
                const hdr = document.createElement('div');
                hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;';
                hdr.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;">&#x2699; Mutation Config</span>';
                const cb = document.createElement('button'); cb.textContent = '✕';
                cb.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;';
                cb.onclick = () => cfgGui.remove();
                hdr.appendChild(cb); cfgGui.appendChild(hdr);
                const body = document.createElement('div');
                body.style.cssText = 'padding:10px 12px;display:flex;flex-direction:column;gap:10px;';

                const trackLbl = document.createElement('div');
                trackLbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#4a8a8a;';
                trackLbl.textContent = 'Track Mutations'; body.appendChild(trackLbl);

                const pillsWrap = document.createElement('div');
                pillsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
                [['rainbow','Rainbow'],['gold','Gold'],['frozen','Frozen'],['thunderstruck','Thunderstruck'],['thundercharged','Thundercharged'],['wet','Wet'],['chilled','Chilled'],
                 ['amberlit','Amberlit'],['dawnlit','Dawnlit'],['dawncharged','Dawnbound'],['ambercharged','Amberbound'],
                 ['none','None']
                ].forEach(([key, label]) => {
                    const btn = buildPill(key, c); btn.textContent = label; pillsWrap.appendChild(btn);
                });
                body.appendChild(pillsWrap);

                const combineLbl = document.createElement('div');
                combineLbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#4a8a8a;';
                combineLbl.textContent = 'Combine Bars'; body.appendChild(combineLbl);

                const combineWrap = document.createElement('div');
                combineWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
                [['combineRainbow','Rainbow+Gold'],['combineAmberDawn','Amberlit+Dawnlit'],
                 ['combineDawnAmbercharged','Dawnbound+Amberbound'],['combineFrozenThunderstruck','Frozen+Thunderstruck']
                ].forEach(([key, label]) => {
                    const btn = buildPill(key, c); btn.textContent = label; combineWrap.appendChild(btn);
                });
                body.appendChild(combineWrap);
                cfgGui.appendChild(body);

                cfgGui.querySelectorAll('.go-mut-cfg-pill').forEach(pill => {
                    pill.addEventListener('click', function(ev) {
                        ev.preventDefault(); ev.stopPropagation();
                        const latest = Object.assign({}, MUTATION_DEFAULTS, getMagicCircleValue('mutation_tracking', null) || {});
                        latest[pill.getAttribute('data-key')] = !latest[pill.getAttribute('data-key')];
                        setMagicCircleValue('mutation_tracking', latest);
                        renderCfgGui(); updatePopupContent(popup);
                    });
                });
            }
            renderCfgGui();
            document.body.appendChild(cfgGui);
            cfgGui.style.left = Math.round((window.innerWidth  - cfgGui.offsetWidth)  / 2) + 'px';
            cfgGui.style.top  = Math.round((window.innerHeight - cfgGui.offsetHeight) / 2) + 'px';
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
    initAtomHooks();

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
