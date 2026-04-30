// ==UserScript==
// @name         Garden Overview
// @namespace    http://tampermonkey.net/
// @version      1.07
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

    // === Pet catalog capture ===
    let _asPetCatalog = null;
    (function() {
        const _seen = new WeakSet();
        const _NativeObject = Object;
        const _origKeys = _NativeObject.keys;

        function _looksLikePetCatalog(obj, keys) {
            const common = ['Worm','Snail','Bee','Chicken','Bunny','Turkey','Goat'];
            if (common.filter(function(k) { return keys.indexOf(k) !== -1; }).length < 3) return false;
            const sample = obj[common.find(function(k) { return keys.indexOf(k) !== -1; })];
            return sample && typeof sample === 'object' && 'coinsToFullyReplenishHunger' in sample && 'diet' in sample && Array.isArray(sample.diet);
        }

        function _scan(obj, depth) {
            if (!obj || typeof obj !== 'object' || _seen.has(obj)) return;
            _seen.add(obj);
            let keys;
            try { keys = _origKeys.call(_NativeObject, obj); } catch(e) { return; }
            if (!_asPetCatalog && _looksLikePetCatalog(obj, keys)) { _asPetCatalog = obj; return; }
            if (depth >= 3) return;
            for (let i = 0; i < keys.length; i++) {
                try { const v = obj[keys[i]]; if (v && typeof v === 'object') _scan(v, depth + 1); } catch(e) {}
            }
        }

        try {
            _NativeObject.keys = function(obj) {
                const result = _origKeys.call(_NativeObject, obj);
                if (!_asPetCatalog) { try { _scan(obj, 0); } catch(e) {} }
                return result;
            };
            console.log('[GardenOverview] Object.keys override installed');
        } catch(e) { console.warn('[GardenOverview] Pet catalog capture failed:', e); }
    })();

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
            if (retryCount < 20) setTimeout(() => hookAtom(atomPath, key, retryCount + 1), 500);
            return;
        }

        hookedAtoms.add(hookKey);
        const originalRead = atom.read;
        atom.read = function(get) {
            const value = originalRead.call(this, get);
            if (!state.atoms[key]) console.log('[GardenOverview] Atom captured:', key);
            state.atoms[key] = value;
            return value;
        };
    }

    function initAtomHooks() {
        const atoms = [
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/baseAtoms.ts/myUserSlotAtom',              'playerSlot'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/myAtoms.ts/myPrimitivePetSlotsAtom',        'activePets'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/miscAtoms.ts/friendBonusMultiplierAtom',    'friendBonus'],
            ['/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myInventoryAtom',         'inventory'],
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
    const SPECIES_MAX_SCALES = {
        Carrot:        3,   Cabbage:       3,   Strawberry:    2,   Aloe:          2.5,
        Beet:          3,   Rose:          4,   FavaBean:      3,   Delphinium:    3,
        Blueberry:     2,   Apple:         2,   OrangeTulip:   3,   Tomato:        2,
        Daffodil:      3,   Corn:          2,   Watermelon:    3,   Pumpkin:       3,
        Echeveria:     2.75, Gentian:      3,   Coconut:       3,   Banana:        1.7,
        PineTree:      3.5, Lily:          2.75, Camellia:     2.5, Squash:        2.5,
        BurrosTail:    2.5, Mushroom:      3.5, Cactus:        1.8, Bamboo:        2,
        Poinsettia:    2,   VioletCort:    3.5, Chrysanthemum: 2.75, Grape:        2,
        Pepper:        2,   Lemon:         3,   PassionFruit:  2,   DragonFruit:   2,
        Lychee:        2,   Sunflower:     2.5, Pear:          2,   Peach:         3,
        Date:          2,   Cacao:         2.5, Clover:        3,   FourLeafClover: 3,
        Starweaver:    2,   DawnCelestial: 2.5, MoonCelestial: 2
    };

    const SPECIES_VALUES = {
        Carrot: 20,         Cabbage: 42,        Strawberry: 14,     Aloe: 310,
        Beet: 350,          Rose: 300,           FavaBean: 30,       Delphinium: 530,
        Blueberry: 23,      Apple: 73,           OrangeTulip: 767,   Tomato: 27,
        Daffodil: 1090,     Corn: 36,            Watermelon: 2708,   Pumpkin: 3700,
        Echeveria: 4600,    Pear: 250,           Gentian: 10000,     Coconut: 302,
        PineTree: 15000,    Banana: 1750,        Lily: 20123,        Camellia: 4875,
        Squash: 3500,       Peach: 9000,         BurrosTail: 6000,   Mushroom: 160000,
        Cactus: 261000,     Bamboo: 500000,      Poinsettia: 30000,  VioletCort: 600000,
        Chrysanthemum: 18000, Date: 15000,       Clover: 30,         FourLeafClover: 7777,
        Grape: 12500,       Pepper: 7220,        Lemon: 10000,       PassionFruit: 24500,
        DragonFruit: 24500, Cacao: 70000,        Lychee: 50000,      Sunflower: 750000,
        Starweaver: 10000000, DawnCelestial: 11000000, MoonCelestial: 11000000
    };

    const TRACKED_SPECIES_DEFAULTS = {
        Carrot: false, Cabbage: false, Strawberry: false, Aloe: false, Beet: false,
        Rose: false, FavaBean: false, Delphinium: false, Blueberry: false, Apple: false,
        OrangeTulip: false, Tomato: false, Daffodil: false, Corn: false, Watermelon: false,
        Pumpkin: false, Echeveria: false, Pear: false, Gentian: false, Coconut: false,
        PineTree: false, Banana: false, Lily: false, Camellia: false, Squash: false,
        Peach: false, BurrosTail: false, Mushroom: false, Cactus: false, Bamboo: false,
        Poinsettia: false, VioletCort: false, Chrysanthemum: false, Date: false,
        Clover: false, FourLeafClover: false, Grape: false, Pepper: false, Lemon: false,
        PassionFruit: false, DragonFruit: false, Cacao: false, Lychee: false,
        Sunflower: false, Starweaver: true, DawnCelestial: true, MoonCelestial: true
    };

    const MUTATION_DEFAULTS = {
        wet: false, chilled: false, frozen: true,
        amberlit: true, dawnlit: true, dawncharged: true, ambercharged: true,
        thunderstruck: true, rainbow: true, gold: true,
        none: true,
        combineRainbow: false, combineAmberDawn: false, combineDawnAmbercharged: false,
        combineFrozenThunderstruck: false
    };

    // === Helpers ===
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
        const WEATHER_MULT = { Wet: 2, Chilled: 2, Frozen: 6, Thunderstruck: 5 };
        const TIME_MULT = { Dawnlit: 4, Dawnbound: 7, Dawncharged: 7, Ambershine: 6, Amberbound: 10, Ambercharged: 10 };
        const WEATHER_TIME_COMBO = {
            "Wet+Dawnlit": 5, "Chilled+Dawnlit": 5, "Wet+Ambershine": 7, "Chilled+Ambershine": 7,
            "Frozen+Dawnlit": 9, "Frozen+Dawnbound": 12, "Frozen+Dawncharged": 12,
            "Frozen+Ambershine": 11, "Frozen+Amberbound": 15, "Frozen+Ambercharged": 15,
            "Thunderstruck+Dawnlit": 8, "Thunderstruck+Dawnbound": 11, "Thunderstruck+Dawncharged": 11,
            "Thunderstruck+Ambershine": 10, "Thunderstruck+Amberbound": 14, "Thunderstruck+Ambercharged": 14
        };

        const trackedSpeciesConfig = Object.assign({}, TRACKED_SPECIES_DEFAULTS, getMagicCircleValue('tracked_species', null) || {});
        const trackedSpecies = Object.keys(trackedSpeciesConfig).filter(k => trackedSpeciesConfig[k]);

        const FRIEND_BONUS = typeof state.atoms.friendBonus === 'number' ? state.atoms.friendBonus : 1.5;

        const playerSlot = state.atoms.playerSlot;
        if (!playerSlot) return null;

        const tileObjects = playerSlot.data?.garden?.tileObjects;
        if (!tileObjects) return null;

        const currentTime = Date.now();
        const activePets = state.atoms.activePets || [];
        const inventoryPets = (state.atoms.inventory?.items || []).filter(i => i.itemType === 'Pet');
        const hutchPets = (state.atoms.inventory?.storages || []).filter(s => s.decorId === 'PetHutch').flatMap(s => s.items || []);
        const allAvailablePets = [...activePets, ...inventoryPets, ...hutchPets];

        const stats = {
            missingRainbow: 0, missingGold: 0, goldCount: 0, missingFrozen: 0,
            missingWet: 0, missingChilled: 0,
            missingAmber: 0, missingAmberlit: 0, missingAmbercharged: 0,
            missingDawnlit: 0, missingDawncharged: 0,
            missingAmberDawn: 0, missingDawnAmbercharged: 0,
            missingThunderstruck: 0, missingFrozenAndThunderstruck: 0,
            frozenCount: 0, wetCount: 0, chilledCount: 0, thunderstruckCount: 0,
            noMutations: 0, notMature: 0, notMaxSize: 0,
            matureCount: 0, readyNow: 0,
            boostsUntilMaxSize: 0, totalFarmValue: 0,
            plantCounts: {}, naturalMaxSize: [],
            maxEndTime: 0, minEndTime: Infinity,
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
                const xpComponent = Math.min(Math.floor((p.xp || 0) / (100 * 3600) * 30), 30);
                const scaleComponent = Math.floor((((p.targetScale || 1) - 1) / (2.5 - 1)) * 20 + 80) - 30;
                const base = xpComponent + scaleComponent;
                const minutesRemoved = (base / 100 * 5) * 60 * (1 - Math.pow(1 - 0.27 * base / 100, 1 / 60));
                expectedMinutesRemoved += minutesRemoved;
            });
            return { expectedMinutesRemoved };
        }

        const turtleExpectations = getTurtleExpectations(activePets);
        const hasTurtleBoost = turtleExpectations.expectedMinutesRemoved > 0;

        const NATURAL_MAX_SIZE_DURATIONS = {
            Carrot: [12000], Strawberry: [25000,30000,35000,40000,45000], Aloe: [112500],
            Delphinium: [75000], Blueberry: [55000,66000,77000,88000,99000],
            Apple: [13500000,16200000,18900000,21600000,24300000,27000000,29700000],
            OrangeTulip: [24000], Tomato: [100000,120000], Daffodil: [150000], Corn: [75000],
            Watermelon: [2160000], Pumpkin: [6300000], Echeveria: [330000], Cabbage: [135000],
            Beet: [180000], Rose: [1200000], FavaBean: [720000], Gentian: [270000],
            Coconut: [12600000,14400000,16200000,18000000,19800000,21600000,23400000],
            Banana: [9900000,12150000,14400000,16650000,18900000], PineTree: [50400000],
            Lily: [660000],
            Camellia: [32400000,37800000,43200000,48600000,54000000,59400000,64800000,70200000],
            Squash: [600000,700000,800000], BurrosTail: [300000,350000], Mushroom: [302400000],
            Cactus: [16200000], Bamboo: [86400000], Poinsettia: [8100000,10800000],
            Chrysanthemum: [35100000,40500000,45900000,51300000,56700000,62100000,67500000],
            Grape: [2250000],
            Pepper: [1500000,1800000,2100000,2400000,2700000,3000000,3300000,3600000,3900000],
            Lemon: [12600000,14400000,16200000,18000000,19800000,21600000],
            PassionFruit: [6750000,8100000],
            DragonFruit: [2250000,2700000,3150000,3600000,4050000,4500000,4950000],
            Lychee: [4500000,5400000,6300000,7200000,8100000,9000000],
            Sunflower: [54000000], VioletCort: [226800000],
            Starweaver: [216000000], DawnCelestial: [259200000],
            MoonCelestial: [216000000,259200000,302400000]
        };

        Object.entries(tileObjects).forEach(([tileId, tile]) => {
            if (tile.objectType !== 'plant' || !tile.slots?.length) return;

            if (trackedSpecies.includes(tile.species)) {
                stats.plantCounts[tile.species] = (stats.plantCounts[tile.species] || 0) + 1;
                stats.plantCounts[tile.species + 'Slots'] = (stats.plantCounts[tile.species + 'Slots'] || 0) + tile.slots.length;
            }

            const isTargetSpecies = trackedSpecies.includes(tile.species);
            const maxScale = SPECIES_MAX_SCALES[tile.species];

            tile.slots.forEach((slot, slotIndex) => {
                const mutations = slot.mutations || [];

                if (isTargetSpecies) {
                    if (slot.endTime > stats.maxEndTime) stats.maxEndTime = slot.endTime;
                    if (slot.endTime > currentTime && slot.endTime < stats.minEndTime) stats.minEndTime = slot.endTime;
                    if (currentTime < slot.endTime) stats.notMature++;
                    else stats.readyNow++;
                }

                if (isTargetSpecies) stats.matureCount += (currentTime >= slot.endTime ? 1 : 0);
                if (isTargetSpecies && maxScale && (slot.targetScale || 1) < maxScale) stats.notMaxSize++;

                if (isTargetSpecies && !mutations.includes(RAINBOW_MUTATION) && !mutations.includes(GOLD_MUTATION)) stats.missingRainbow++;
                if (isTargetSpecies && mutations.includes(GOLD_MUTATION)) stats.goldCount++;
                if (isTargetSpecies && !mutations.includes(GOLD_MUTATION) && !mutations.includes(RAINBOW_MUTATION)) stats.missingGold++;
                if (isTargetSpecies && mutations.includes(FROZEN_MUTATION)) stats.frozenCount++;
                if (isTargetSpecies && !mutations.includes(FROZEN_MUTATION) && !mutations.includes('Thunderstruck') && !mutations.includes('Wet') && !mutations.includes('Chilled')) stats.missingFrozen++;
                if (isTargetSpecies && !mutations.includes(AMBERCHARGED_MUTATION) && !mutations.includes(AMBERSHINE_MUTATION) && !mutations.includes('Dawnlit') && !mutations.includes('Dawncharged')) stats.missingAmber++;
                if (isTargetSpecies && !mutations.includes(AMBERCHARGED_MUTATION)) stats.missingAmbercharged++;
                if (isTargetSpecies) {
                    const key = tile.species;
                    if (mutations.includes('Rainbow')) stats.plantCounts[`${key}Rainbow`] = (stats.plantCounts[`${key}Rainbow`] || 0) + 1;
                    if (mutations.includes('Gold'))    stats.plantCounts[`${key}Gold`]    = (stats.plantCounts[`${key}Gold`]    || 0) + 1;
                }
                if (isTargetSpecies) {
                    const hasThunderstruck = mutations.includes('Thunderstruck');
                    const hasFrozenMut = mutations.includes(FROZEN_MUTATION);
                    const hasWet = mutations.includes('Wet');
                    const hasChilled = mutations.includes('Chilled');
                    if (hasWet) stats.wetCount++;
                    if (!hasWet && !hasThunderstruck && !hasFrozenMut) stats.missingWet++;
                    if (hasChilled) stats.chilledCount++;
                    if (!hasChilled && !hasThunderstruck && !hasFrozenMut) stats.missingChilled++;
                    if (!mutations.includes(AMBERSHINE_MUTATION))       stats.missingAmberlit++;
                    if (!mutations.includes('Dawnlit'))                 stats.missingDawnlit++;
                    if (!mutations.includes('Dawncharged'))             stats.missingDawncharged++;
                    if (!mutations.includes(AMBERSHINE_MUTATION) && !mutations.includes('Dawnlit'))           stats.missingAmberDawn++;
                    if (!mutations.includes('Dawncharged') && !mutations.includes(AMBERCHARGED_MUTATION))     stats.missingDawnAmbercharged++;
                    if (hasThunderstruck) stats.thunderstruckCount++;
                    if (!hasThunderstruck && !hasWet && !hasChilled && !hasFrozenMut) stats.missingThunderstruck++;
                    if (!hasFrozenMut && !hasThunderstruck && !hasWet && !hasChilled) stats.missingFrozenAndThunderstruck++;
                }
                if (isTargetSpecies && mutations.length === 0) stats.noMutations++;

                // Natural max size detection
                if (maxScale) {
                    const isMaxScale = slot.targetScale === maxScale;
                    if (isMaxScale) {
                        const naturalDurations = NATURAL_MAX_SIZE_DURATIONS[tile.species];
                        if (naturalDurations && naturalDurations[slotIndex] === (slot.endTime - slot.startTime)) {
                            stats.naturalMaxSize.push({ species: tile.species, tileId, slotIndex, mutations, targetScale: slot.targetScale });
                        }
                    }
                }

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
                    stats.totalFarmValue += Math.round(Math.round(color * wt) * (SPECIES_VALUES[tile.species] || 0) * (slot.targetScale || 1) * FRIEND_BONUS);
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

        let maxBoostsNeeded = 0;
        Object.values(tileObjects).forEach(tile => {
            if (tile.objectType !== 'plant' || !tile.slots?.length) return;
            if (!trackedSpecies.includes(tile.species)) return;
            const maxScale = SPECIES_MAX_SCALES[tile.species];
            tile.slots.forEach(slot => {
                let s = slot.targetScale || 1;
                if (s < maxScale) {
                    let boosts = 0;
                    while (s < maxScale) { s *= boostMultiplier; boosts++; if (boosts > 20) break; }
                    if (boosts > maxBoostsNeeded) maxBoostsNeeded = boosts;
                }
            });
        });

        stats.boostsUntilMaxSize = maxBoostsNeeded;

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

        let maxBoostsNeededBee = 0;
        Object.values(tileObjects).forEach(tile => {
            if (tile.objectType !== 'plant' || !tile.slots?.length) return;
            if (!trackedSpecies.includes(tile.species)) return;
            const maxScale = SPECIES_MAX_SCALES[tile.species];
            tile.slots.forEach(slot => {
                let s = slot.targetScale || 1;
                if (s < maxScale) {
                    let boosts = 0;
                    while (s < maxScale) { s *= beeBoostMultiplier; boosts++; if (boosts > 200) break; }
                    if (boosts > maxBoostsNeededBee) maxBoostsNeededBee = boosts;
                }
            });
        });
        stats.boostsUntilMaxSizeBee = maxBoostsNeededBee;

        stats.granterETAs = {
            rainbow:    getGranterETA(activePets, 'RainbowGranter',    0.72, stats.missingRainbow),
            gold:       getGranterETA(activePets, 'GoldGranter',       0.72, stats.missingGold),
            frozen:     getGranterETA(activePets, 'FrostGranter',      6.0,  stats.missingFrozen),
            amberlit:   getGranterETA(activePets, 'AmberlitGranter',   2.0,  stats.missingAmber),
            wet:         getGranterETA(activePets, 'RainDance',          10.0, stats.missingWet),
            chilled:     getGranterETA(activePets, 'SnowGranter',       8.0,  stats.missingChilled),
            cropSize:    getGranterETA(activePets, ['ProduceScaleBoostII', 'Crop Size Boost II'], 0.40, stats.boostsUntilMaxSize),
            cropSizeBee: getGranterETA(activePets, 'ProduceScaleBoost', 0.30, stats.boostsUntilMaxSizeBee),
        };
        stats.trackedSpecies = trackedSpecies;
        stats.TRACKED_SPECIES_DEFAULTS = TRACKED_SPECIES_DEFAULTS;
        stats.friendBonus = FRIEND_BONUS;
        return stats;
    }

    // === updatePopupContent ===
    function updatePopupContent(popup) {
        if (!popup) popup = document.getElementById('farm-stats-popup');
        if (!popup) return;
        const stats = getFarmStatsData();
        if (!stats) return;

        const totalSlots = stats.trackedSpecies.reduce((sum, s) => sum + (stats.plantCounts[s + 'Slots'] || 0), 0);

        const plantsWasOpen = popup.querySelector('.plant-breakdown')
            ? popup.querySelector('.plant-breakdown').style.display === 'block'
            : localStorage.getItem('farmStatsPopup_plantsOpen') !== '0';
        const mutationsWasOpen = popup.querySelector('.mutations-breakdown')
            ? popup.querySelector('.mutations-breakdown').style.display !== 'none'
            : localStorage.getItem('farmStatsPopup_mutationsOpen') !== '0';

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
        const frozenOrThunderstruckHave = stats.frozenCount + stats.thunderstruckCount;

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
            goodBars += mutBar('Frozen / Thunderstruck', '#7ec8e3', frozenOrThunderstruckHave, totalSlots);
        } else {
            if (mutConfig.frozen)       goodBars += mutBar('Frozen', '#7ec8e3', frozenHave, totalSlots);
            if (mutConfig.thunderstruck) goodBars += mutBar('Thunderstruck', '#ffd700', thunderstruckHave, totalSlots);
        }
        if (mutConfig.wet)     goodBars += mutBar('Wet', '#4fc3f7', wetHave, totalSlots);
        if (mutConfig.chilled) goodBars += mutBar('Chilled', '#81d4fa', chilledHave, totalSlots);
        if (combineAmberDawn) {
            goodBars += mutBar('Amberlit / Dawnlit', '#ff9a00', amberDawnHave, totalSlots);
        } else {
            if (mutConfig.amberlit) goodBars += mutBar('Amberlit', '#ff8c00', amberlitHave, totalSlots);
            if (mutConfig.dawnlit)  goodBars += mutBar('Dawnlit', '#f4a261', dawnlitHave, totalSlots);
        }
        if (combineDawnAmbercharged) {
            goodBars += mutBar('Dawncharged / Ambercharged', '#e07b39', dawnAmberchargedHave, totalSlots);
        } else {
            if (mutConfig.dawncharged)  goodBars += mutBar('Dawncharged', '#e07b39', dawnchargedHave, totalSlots);
            if (mutConfig.ambercharged) goodBars += mutBar('Ambercharged', '#c45e00', amberchargedHave, totalSlots);
        }
        const badBars = (mutConfig.none ? badMutBar('None', '#c084e8', stats.noMutations, totalSlots) : '');

        const etaRows = etaRow('&#x1F308; Rainbow', stats.missingRainbow, totalSlots, stats.granterETAs?.rainbow, rainbowGradient)
            + etaRow('&#x1FAB4; Gold', stats.missingGold, totalSlots, stats.granterETAs?.gold, '#ffd700')
            + etaRow('&#x2744;&#xFE0F; Frozen', stats.missingFrozen, totalSlots, stats.granterETAs?.frozen, '#7ec8e3')
            + etaRow('&#x1F4A7; Wet', stats.missingWet, totalSlots, stats.granterETAs?.wet, '#4fc3f7')
            + etaRow('&#x2745;&#xFE0F; Chilled', stats.missingChilled, totalSlots, stats.granterETAs?.chilled, '#81d4fa')
            + etaRow('&#x2728; Amberlit', stats.missingAmber, totalSlots, stats.granterETAs?.amberlit, '#ff8c00')
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

        const naturalMaxHTML = stats.naturalMaxSize.length > 0 ? `
            <div style="padding:10px 16px;border-top:1px solid #1a2a2a;">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;margin-bottom:8px;">Natural Max Size</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 15px;font-size:12px;padding-left:10px;">
                    ${stats.naturalMaxSize.map(n => `
                        <div style="color:#7ab8b8;">${n.species}</div>
                        <div style="text-align:right;color:#7ab8b8;">${n.mutations.length > 0 ? n.mutations.join(', ') : 'No mutations'}</div>
                    `).join('')}
                </div>
            </div>` : '';

        popup.innerHTML = `
            <div style="background:#0a1f1f;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;cursor:move;">
                <span style="font-size:13px;font-weight:bold;color:#a4f5f5;letter-spacing:0.03em;">&#x1F33F; Garden Overview</span>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button class="species-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure tracked plants">&#x1F33F;</button>
                    <button class="mut-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure tracked mutations">&#x2699;</button>
                    <button class="keybind-config-btn" style="background:rgba(255,255,255,0.08);border:none;color:#7ab8b8;cursor:pointer;font-size:13px;border-radius:4px;width:24px;height:24px;line-height:1;" title="Configure keybind">&#x2328;</button>
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

            ${naturalMaxHTML}

            <div style="padding:10px 16px;border-bottom:1px solid #1a2a2a;">
                <div class="plant-toggle-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#4a8a8a;display:flex;align-items:center;gap:6px;">
                        Plants <span style="flex:1;height:1px;background:#1e3a3a;display:block;"></span>
                    </div>
                    <span class="plant-toggle-arrow" style="color:#4a8a8a;font-size:10px;">${plantsWasOpen ? '&#x25BE;' : '&#x25B8;'}</span>
                </div>
                <div class="plant-breakdown" style="display:${plantsWasOpen ? 'block' : 'none'};margin-top:6px;padding-left:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:2px 0;margin-bottom:2px;">
                        <span style="color:#7ab8b8;">Total Slots</span>
                        <span style="color:#7ab8b8;font-weight:bold;">${totalSlots}</span>
                    </div>
                    ${stats.trackedSpecies.filter(s => (stats.plantCounts[s] || 0) > 0).map(s =>
                        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;"><span style="color:#7ab8b8;">${s}</span><span style="color:#7ab8b8;">${stats.plantCounts[s]}</span></div>`
                    ).join('')}
                </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#0a1f1f;border-top:1px solid #1e3a3a;">
                <span style="font-size:11px;color:#4a8a8a;">Est. value &nbsp;<span style="font-size:10px;background:#1e3a3a;color:#4a8a8a;padding:1px 6px;border-radius:3px;">+${Math.round((stats.friendBonus - 1) * 100)}% bonus</span></span>
                <span style="font-size:20px;font-weight:bold;color:#ffd84d;">${formatFarmValue(stats.totalFarmValue)}</span>
            </div>
        `;

        // Close button
        popup.querySelector('.close-farm-stats-btn').onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            if (popup.refreshInterval) clearInterval(popup.refreshInterval);
            popup.remove();
            document.getElementById('mut-config-gui')?.remove();
            document.getElementById('species-config-gui')?.remove();
            document.getElementById('keybind-config-gui')?.remove();
        };

        // Keybind config button
        popup.querySelector('.keybind-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('keybind-config-gui');
            if (existing) { existing.remove(); return; }

            const kbGui = document.createElement('div');
            kbGui.id = 'keybind-config-gui';
            kbGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a2a2a;';
            hdr.innerHTML = '<span style="font-size:11px;font-weight:bold;color:#a4f5f5;">&#x2328; Keybind</span>';
            const closebtn = document.createElement('button'); closebtn.textContent = '✕';
            closebtn.style.cssText = 'background:#c0392b;color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:10px;cursor:pointer;';
            closebtn.onclick = () => kbGui.remove();
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
                document.addEventListener('keydown', _kbHandler, true);
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
            localStorage.setItem('farmStatsPopup_mutationsOpen', bd.style.display === 'block' ? '1' : '0');
        });

        // Plants toggle
        popup.querySelector('.plant-toggle-header').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const bd = popup.querySelector('.plant-breakdown');
            const ar = popup.querySelector('.plant-toggle-arrow');
            bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
            ar.textContent = bd.style.display === 'block' ? '▾' : '▸';
            localStorage.setItem('farmStatsPopup_plantsOpen', bd.style.display === 'block' ? '1' : '0');
        });

        // Species config button
        popup.querySelector('.species-config-btn').addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            const existing = document.getElementById('species-config-gui');
            if (existing) { existing.remove(); return; }

            const speciesGui = document.createElement('div');
            speciesGui.id = 'species-config-gui';
            speciesGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:230px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

            function buildSpeciesPill(key, cfg) {
                const on = !!cfg[key];
                const btn = document.createElement('button');
                btn.className = 'species-pill'; btn.setAttribute('data-key', key); btn.textContent = key;
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
                speciesGui.querySelectorAll('.species-pill').forEach(pill => {
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
            const existing = document.getElementById('mut-config-gui');
            if (existing) { existing.remove(); return; }

            const cfgGui = document.createElement('div');
            cfgGui.id = 'mut-config-gui';
            cfgGui.style.cssText = 'position:fixed;z-index:31000;background:#0a1f1f;border:1px solid #1e3a3a;border-radius:8px;padding:0;font-family:monospace;width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

            function buildPill(key, cfg) {
                const on = cfg[key] !== false;
                const btn = document.createElement('button');
                btn.className = 'mut-cfg-pill'; btn.setAttribute('data-key', key); btn.textContent = key;
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
                [['rainbow','Rainbow'],['gold','Gold'],['frozen','Frozen'],['thunderstruck','Thunderstruck'],['wet','Wet'],['chilled','Chilled'],
                 ['amberlit','Amberlit'],['dawnlit','Dawnlit'],['dawncharged','Dawncharged'],['ambercharged','Ambercharged'],
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
                 ['combineDawnAmbercharged','Dawncharged+Ambercharged'],['combineFrozenThunderstruck','Frozen+Thunderstruck']
                ].forEach(([key, label]) => {
                    const btn = buildPill(key, c); btn.textContent = label; combineWrap.appendChild(btn);
                });
                body.appendChild(combineWrap);
                cfgGui.appendChild(body);

                cfgGui.querySelectorAll('.mut-cfg-pill').forEach(pill => {
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
        const existing = document.getElementById('farm-stats-popup');
        if (existing) {
            if (existing.refreshInterval) clearInterval(existing.refreshInterval);
            existing.remove();
            document.getElementById('mut-config-gui')?.remove();
            document.getElementById('species-config-gui')?.remove();
            document.getElementById('keybind-config-gui')?.remove();
            return;
        }

        if (!state.atoms.playerSlot) {
            console.log('[GardenOverview] Not ready yet.');
            return;
        }

        const popup = document.createElement('div');
        popup.id = 'farm-stats-popup';
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
        } else {
            popup.style.left = Math.round((window.innerWidth  - popup.offsetWidth)  / 2) + 'px';
            popup.style.top  = Math.round((window.innerHeight - popup.offsetHeight) / 2) + 'px';
        }

        // Drag logic — listener on popup itself so it survives innerHTML refreshes
        let dragging = false, dragOffX, dragOffY;
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
            const maxLeft = window.innerWidth  - popup.offsetWidth;
            const maxTop  = window.innerHeight - popup.offsetHeight;
            popup.style.left = Math.max(0, Math.min(maxLeft, e.clientX - dragOffX)) + 'px';
            popup.style.top  = Math.max(0, Math.min(maxTop,  e.clientY - dragOffY)) + 'px';
        });
        document.addEventListener('mouseup', function() {
            if (dragging) setMagicCircleValue('go_popup_position', { left: popup.style.left, top: popup.style.top });
            dragging = false;
        });

        popup.refreshInterval = setInterval(() => {
            if (!document.getElementById('farm-stats-popup')) { clearInterval(popup.refreshInterval); return; }
            updatePopupContent(popup);
        }, 5000);
    }

    // === Trigger button ===
    function createTriggerButton() {
        console.log('[GardenOverview] createTriggerButton called, document.body:', !!document.body);
        if (document.getElementById('garden-overview-trigger')) return;
        const btn = document.createElement('button');
        btn.id = 'garden-overview-trigger';
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
