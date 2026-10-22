'use strict';

const utils = require('@iobroker/adapter-core');
const https = require('node:https');
const endpoints = require('./lib/endpoints.json');
/** @type {{ paths: Record<string, ioBroker.Translated>, keys: Record<string, ioBroker.Translated>, suffixes: Record<string, ioBroker.Translated> }} */
const names = require('./lib/names.json');

/** Abstand, in dem Verlaufsdaten und andere selten ändernde Werte abgefragt werden (1 Stunde) */
const SLOW_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Datum als JJJJ-MM-TT in lokaler Zeit.
 *
 * @param {Date} date - Datum
 * @returns {string} Formatiertes Datum
 */
function formatDate(date) {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Seltene Werte: Verlaufsdaten und die WLAN-Liste.
 *
 * @param {string} apiPath - API-Pfad
 * @returns {boolean} true, wenn der Pfad nur stündlich abgefragt werden soll
 */
function isSlowPath(apiPath) {
	return apiPath.startsWith('/recordings/') || apiPath === '/gateway/wifi/apList';
}

/**
 * Einheit der API in die Schreibweise von ioBroker umwandeln.
 *
 * @param {string | undefined} unit - Einheit der API
 * @returns {string | undefined} Einheit für ioBroker
 */
function normalizeUnit(unit) {
	return unit === 'C' ? '°C' : unit;
}

/**
 * Passende Rolle für einen Zahlenwert anhand seiner Einheit.
 *
 * @param {string | undefined} unit - Einheit
 * @param {string} apiPath - API-Pfad (zur Erkennung der Luftfeuchtigkeit)
 * @returns {string} Rolle des Datenpunkts
 */
function numberRole(unit, apiPath) {
	switch (unit) {
		case '°C':
			return 'value.temperature';
		case 'kWh':
		case 'Wh':
			return 'value.power.consumption';
		case 'W':
		case 'kW':
			return 'value.power';
		case 'bar':
			return 'value.pressure';
		default:
			return unit === '%' && /humidity/i.test(apiPath) ? 'value.humidity' : 'value';
	}
}

/** Lesbare Namen für die Ordner im Objektbaum */
/** @type {Record<string, ioBroker.Translated>} */
const FOLDER_NAMES = {
	signals: { en: 'Signals', de: 'Signale' },
	heatSources: { en: 'Heat sources', de: 'Wärmeerzeuger' },
	heatingCircuits: { en: 'Heating circuits', de: 'Heizkreise' },
	dhwCircuits: { en: 'Hot water circuits', de: 'Warmwasserkreise' },
	devices: { en: 'Devices', de: 'Geräte' },
	recordings: { en: 'History', de: 'Verlaufsdaten' },
	system: { en: 'System', de: 'System' },
	gateway: { en: 'Gateway', de: 'Gateway' },
	zones: { en: 'Zones', de: 'Zonen' },
	solarCircuits: { en: 'Solar circuits', de: 'Solarkreise' },
	ventilation: { en: 'Ventilation', de: 'Lüftung' },
	pool: { en: 'Pool', de: 'Pool' },
	emon: { en: 'Energy monitoring', de: 'Energiezähler' },
	sensors: { en: 'Sensors', de: 'Sensoren' },
	temperatures: { en: 'Temperatures', de: 'Temperaturen' },
	refrigerant: { en: 'Refrigerant circuit', de: 'Kältekreis' },
	brineCircuit: { en: 'Brine circuit', de: 'Solekreis' },
	powerConstraints: { en: 'Power constraints', de: 'Leistungsbeschränkungen' },
	externalInputs: { en: 'External inputs', de: 'Externe Eingänge' },
	variableTariff: { en: 'Variable tariff', de: 'Variabler Tarif' },
	wifi: { en: 'Wi-Fi', de: 'WLAN' },
	eth: { en: 'Ethernet', de: 'LAN' },
	update: { en: 'Update', de: 'Update' },
	Source: { en: 'Source', de: 'Quelle' },
	additionalHeater: { en: 'Additional heater', de: 'Zuheizer' },
	additionalHeaterBlock: { en: 'Additional heater block', de: 'Zuheizer-Sperre' },
	affectedDomain: { en: 'Affected domains', de: 'Betroffene Bereiche' },
	appliancePowerBlock: { en: 'Power block', de: 'Leistungssperre' },
	appliancePowerLimit: { en: 'Power limit', de: 'Leistungsbegrenzung' },
	ch: { en: 'Heating', de: 'Heizen' },
	compressor: { en: 'Compressor', de: 'Verdichter' },
	cooling: { en: 'Cooling', de: 'Kühlen' },
	coolingBlock: { en: 'Cooling block', de: 'Kühlsperre' },
	dataProcessing: { en: 'Data processing', de: 'Datenverarbeitung' },
	dhw: { en: 'Hot water', de: 'Warmwasser' },
	dhwBlock: { en: 'Hot water block', de: 'Warmwassersperre' },
	dhwReduceTempOnAlarm: { en: 'Hot water reduction on alarm', de: 'Warmwasser-Absenkung bei Alarm' },
	eHeater: { en: 'Electric heater', de: 'Elektroheizstab' },
	fallbackOperation: { en: 'Fallback operation', de: 'Notbetrieb' },
	filter: { en: 'Filter', de: 'Filter' },
	heating: { en: 'Heating', de: 'Heizen' },
	heatingBlock: { en: 'Heating block', de: 'Heizsperre' },
	highSourceTempStopCooling: { en: 'Cooling stop high source temperature', de: 'Kühlstopp hohe Quellentemperatur' },
	highSourceTempStopHeating: { en: 'Heating stop high source temperature', de: 'Heizstopp hohe Quellentemperatur' },
	hybrid: { en: 'Hybrid', de: 'Hybrid' },
	ip: { en: 'IP address', de: 'IP-Adresse' },
	lowSourceTempStopCooling: { en: 'Cooling stop low source temperature', de: 'Kühlstopp niedrige Quellentemperatur' },
	lowSourceTempStopHeating: { en: 'Heating stop low source temperature', de: 'Heizstopp niedrige Quellentemperatur' },
	maintenanceMode: { en: 'Maintenance mode', de: 'Wartungsmodus' },
	openWindowDetection: { en: 'Open window detection', de: 'Fenster-offen-Erkennung' },
	powerElecDesired: { en: 'Desired electrical power', de: 'Gewünschte elektrische Leistung' },
	powerElecLimitation: { en: 'Electrical power limitation', de: 'Begrenzung elektrische Leistung' },
	powerGuard: { en: 'Power guard', de: 'Leistungswächter' },
	powerLimitation: { en: 'Power limitation', de: 'Leistungsbegrenzung' },
	primary: { en: 'Primary circuit', de: 'Primärkreis' },
	pv: { en: 'Photovoltaics', de: 'Photovoltaik' },
	safetyBoard: { en: 'Safety board', de: 'Sicherheitsplatine' },
	silentMode: { en: 'Silent mode', de: 'Flüsterbetrieb' },
	smartFunction: { en: 'Smart function', de: 'Smart-Funktion' },
	status: { en: 'Status', de: 'Status' },
	summerBypass: { en: 'Summer bypass', de: 'Sommer-Bypass' },
	total: { en: 'Total', de: 'Gesamt' },
	tzInfo: { en: 'Time zone', de: 'Zeitzone' },
	userAdditionalHeaterBlock: { en: 'User additional heater block', de: 'Zuheizer-Sperre durch Benutzer' },
	workingTime: { en: 'Working time', de: 'Laufzeit' },
	// Ordner der Signale
	Stats: { en: 'Statistics', de: 'Statistik' },
	Timer: { en: 'Timer', de: 'Timer' },
	RelayStatus: { en: 'Relay status', de: 'Relaisstatus' },
	HolidayNew: { en: 'Holiday programs', de: 'Urlaubsprogramme' },
	InstallationDate: { en: 'Installation date', de: 'Installationsdatum' },
	SeasonOpt: { en: 'Season optimization', de: 'Saisonoptimierung' },
	LocSeasonOpt: { en: 'Local season optimization', de: 'Lokale Saisonoptimierung' },
	FlowCtrl: { en: 'Flow control', de: 'Vorlaufregelung' },
	IntDHW: { en: 'Internal hot water', de: 'Warmwasser intern' },
	HMI: { en: 'Control unit', de: 'Bedieneinheit' },
	EM: { en: 'Energy manager', de: 'Energiemanager' },
	CH: { en: 'Heating', de: 'Heizen' },
	DHW: { en: 'Hot water', de: 'Warmwasser' },
	Cooling: { en: 'Cooling', de: 'Kühlen' },
	Additional: { en: 'Additional heater', de: 'Zuheizer' },
};

/** Muster für nummerierte Ordner, z. B. hc1 = Heizkreis 1 */
/** @type {[RegExp, string, string][]} */
const NUMBERED_FOLDERS = [
	[/^hc(\d+)$/, 'Heating circuit', 'Heizkreis'],
	[/^dhw(\d+)$/, 'Hot water circuit', 'Warmwasserkreis'],
	[/^hs(\d+)$/, 'Heat source', 'Wärmeerzeuger'],
	[/^device(\d+)$/, 'Device', 'Gerät'],
	[/^zone(\d+)$/, 'Zone', 'Zone'],
	[/^sc(\d+)$/, 'Solar circuit', 'Solarkreis'],
	[/^input(\d+)$/, 'Input', 'Eingang'],
	[/^HP(\d+)$/, 'Heat pump', 'Wärmepumpe'],
	[/^HC(\d+)$/, 'Heating circuit', 'Heizkreis'],
	[/^DHW(\d+)$/, 'Hot water circuit', 'Warmwasserkreis'],
];

/**
 * Lesbarer Name für einen Ordner im Objektbaum.
 *
 * @param {string} segment - Teil der Datenpunkt-ID, z. B. heatingCircuits oder hc1
 * @returns {ioBroker.StringOrTranslated} Name
 */
function folderName(segment) {
	if (FOLDER_NAMES[segment]) {
		return FOLDER_NAMES[segment];
	}
	for (const [pattern, en, de] of NUMBERED_FOLDERS) {
		const match = pattern.exec(segment);
		if (match) {
			return { en: `${en} ${match[1]}`, de: `${de} ${match[1]}` };
		}
	}
	return segment;
}

/**
 * Name eines Datenpunkts aus der Übersetzungsdatei (deutsch und englisch), sonst der API-Pfad.
 *
 * @param {string} apiPath - API-Pfad
 * @returns {ioBroker.StringOrTranslated} Name
 */
function nameFor(apiPath) {
	return names.paths[apiPath] ?? apiPath;
}

/**
 * Hängt einen Zusatz an einen Namen an, z. B. "Energie gesamt – Verdichter".
 *
 * @param {ioBroker.StringOrTranslated} base - Grundname
 * @param {ioBroker.StringOrTranslated} part - Zusatz
 * @returns {ioBroker.StringOrTranslated} zusammengesetzter Name
 */
function withPart(base, part) {
	const b = typeof base === 'string' ? { en: base, de: base } : base;
	const p = typeof part === 'string' ? { en: part, de: part } : part;
	return { en: `${b.en} – ${p.en}`, de: `${b.de ?? b.en} – ${p.de ?? p.en}` };
}

/**
 * Aus einem API-Pfad die ID eines Datenpunkts bilden.
 *
 * @param {string} apiPath - API-Pfad, z. B. /signals/SRC.OutdoorTemp
 * @returns {string} Datenpunkt-ID
 */
function toId(apiPath) {
	return apiPath
		.replace(/^\//, '')
		.replace(/\//g, '.')
		.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Einheiten, bei denen die API die Summe aller Einzelmessungen liefert, sinnvoll ist aber der Durchschnitt.
 * Energie (kWh), Starts und Laufzeiten bleiben dagegen Summen.
 */
const AVERAGE_UNITS = ['°C', 'K', '%', 'bar'];

/**
 * Wandelt die Messreihe einer Verlaufsabfrage in eine Liste mit Datum und Wert um.
 *
 * @param {any} response - Antwort der API
 * @param {'P1D' | 'P1M'} rate - Abtastrate (Tage oder Monate)
 * @param {boolean} average - true: Durchschnitt (Summe geteilt durch Anzahl Messungen) statt Summe
 * @returns {{ date: string, value: number | null, samples: number }[]} Messreihe
 */
function extractSeries(response, rate, average) {
	const groups = response?.values ?? [];
	const group = groups.find((/** @type {any} */ entry) => entry.sampleRate === rate) ?? groups[0];
	if (!group || !Array.isArray(group.recording) || typeof group.startTime !== 'string') {
		return [];
	}
	const [year, month, day] = group.startTime.slice(0, 10).split('-').map(Number);
	return group.recording.map((/** @type {{ y: number, c: number }} */ item, /** @type {number} */ index) => {
		const date =
			rate === 'P1D'
				? new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10)
				: new Date(Date.UTC(year, month - 1 + index, 1)).toISOString().slice(0, 7);
		/** @type {number | null} */
		let value = item.y;
		if (average) {
			value = item.c > 0 ? Math.round((item.y / item.c) * 10) / 10 : null;
		}
		return { date, value, samples: item.c };
	});
}

/** Felder, die nur Zusatzinformationen zur API enthalten und keine Messwerte sind */
const SKIP_KEYS = new Set(['id', 'type', 'writeable', 'allowedValues', 'uri', 'valueConfig']);

/**
 * Zerlegt eine zusammengesetzte Antwort (Objekte und Listen) in einzelne Werte.
 *
 * @param {any} value - Teil der Antwort
 * @param {string} prefix - bisheriger Pfad, z. B. values.0
 * @param {[string, string | number | boolean][]} out - gesammelte Werte (Pfad, Wert)
 */
function flatten(value, prefix, out) {
	if (value === null || value === undefined) {
		return;
	}
	if (Array.isArray(value)) {
		if (value.every(item => item === null || typeof item !== 'object')) {
			// Liste einfacher Werte, z. B. ["ch","dhw"], als Text ablegen
			out.push([prefix, JSON.stringify(value)]);
			return;
		}
		value.forEach((item, index) => flatten(item, prefix ? `${prefix}.${index}` : String(index), out));
		return;
	}
	if (typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			if (SKIP_KEYS.has(key)) {
				continue;
			}
			const safeKey = key.replace(/[^A-Za-z0-9_-]/g, '_');
			flatten(item, prefix ? `${prefix}.${safeKey}` : safeKey, out);
		}
		return;
	}
	out.push([prefix, value]);
}

class BuderusMx400 extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'buderus-mx400',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));

		/** @type {Set<string>} */
		this.knownStates = new Set();
		/** Bereits angelegte Ordner und Kanäle */
		/** @type {Set<string>} */
		this.knownObjects = new Set();
		/** Datenpunkte, die in einzelne Werte aufgeteilt werden (alte Textdatenpunkte wurden entfernt) */
		/** @type {Set<string>} */
		this.expandedStates = new Set();
		/** Zuletzt geschriebene Einzelwerte je zusammengesetzter Antwort */
		/** @type {Map<string, Set<string>>} */
		this.complexLeaves = new Map();
		/** Pfade, die bei der Suche nicht geantwortet haben und stündlich erneut versucht werden */
		/** @type {string[]} */
		this.retryPaths = [];
		/** @type {ioBroker.Timeout | undefined} */
		this.pollTimer = undefined;
		/** Feste Pfade, die es bei dieser Anlage gibt und die bei jedem Durchlauf abgefragt werden */
		/** @type {string[]} */
		this.fixedPaths = [];
		/** Pfade, die es gibt und die nur stündlich abgefragt werden (Verlaufsdaten, WLAN-Liste) */
		/** @type {string[]} */
		this.slowPaths = [];
		this.lastSlowPoll = 0;
		/** Wurde die Suche nach den festen Pfaden abgeschlossen? */
		this.discovered = false;
		/** @type {boolean | undefined} */
		this.connected = undefined;
		this.unloaded = false;
	}

	/**
	 * Fragt einen Pfad der MX400-API ab.
	 * Liefert das Antwortobjekt, bei einem nicht vorhandenen Pfad (404) oder nicht unterstützter Anfrage (400) null.
	 *
	 * @param {string} path - Pfad, z. B. /gateway/brand
	 * @returns {Promise<any>} Antwortobjekt oder null
	 */
	apiGet(path) {
		return new Promise((resolve, reject) => {
			const req = https.request(
				{
					host: this.config.ip,
					port: 9443,
					path,
					method: 'GET',
					headers: { Authorization: `Bearer ${this.config.token}` },
					rejectUnauthorized: false, // Das Gerät nutzt ein selbst signiertes Zertifikat
					timeout: 10000,
				},
				res => {
					let body = '';
					res.on('data', chunk => (body += chunk));
					res.on('end', () => {
						if (res.statusCode === 404 || res.statusCode === 400) {
							resolve(null);
							return;
						}
						if (res.statusCode !== 200) {
							reject(new Error(`HTTP ${res.statusCode} bei ${path}`));
							return;
						}
						try {
							resolve(JSON.parse(body));
						} catch {
							reject(new Error(`Ungültige Antwort bei ${path}`));
						}
					});
				},
			);
			req.on('timeout', () => req.destroy(new Error(`Zeitüberschreitung bei ${path}`)));
			req.on('error', reject);
			req.end();
		});
	}

	/**
	 * Wandelt eine API-Antwort in Wert und Datentyp für ioBroker um.
	 *
	 * @param {any} data - Antwortobjekt der API
	 * @returns {{ val: string | number | boolean | null, type: 'string' | 'number' | 'boolean', unit?: string }} Wert, Typ und Einheit
	 */
	convertValue(data) {
		const raw = data.value;
		const unit = normalizeUnit(data.unitOfMeasure);

		if (data.type === 'floatValue' || data.type === 'integerValue') {
			// Sonderwerte (Kurzschluss, Leitungsbruch, zu geringer Durchfluss ...) nicht als Messwert übernehmen.
			// Die API meldet sie entweder als Liste von Objekten oder als einfaches Objekt.
			const entries = Array.isArray(data.state) ? data.state : [data.state];
			const specialValues = entries
				.filter(entry => entry && typeof entry === 'object')
				.flatMap(entry => Object.values(entry));
			const isSpecial = raw !== undefined && specialValues.includes(raw);
			return { val: isSpecial ? null : raw, type: 'number', unit };
		}
		if (raw === 'true' || raw === 'false') {
			return { val: raw === 'true', type: 'boolean' };
		}
		if (raw === undefined || raw === null) {
			// Antworten ohne einfachen Wert (z. B. Listen) als JSON-Text ablegen
			const rest = { ...data };
			delete rest.id;
			delete rest.writeable;
			return { val: JSON.stringify(rest), type: 'string' };
		}
		if (typeof raw === 'object') {
			return { val: JSON.stringify(raw), type: 'string' };
		}
		return { val: String(raw), type: 'string' };
	}

	/**
	 * Legt bei Bedarf einen Datenpunkt an und schreibt den Wert.
	 *
	 * @param {string} id - Datenpunkt-ID
	 * @param {ioBroker.StringOrTranslated} name - Anzeigename (deutsch und englisch)
	 * @param {string | number | boolean | null} val - Wert
	 * @param {'string' | 'number' | 'boolean'} type - Datentyp
	 * @param {string} role - Rolle des Datenpunkts
	 * @param {string} [unit] - Einheit
	 */
	async setValue(id, name, val, type, role, unit) {
		if (!this.knownStates.has(id)) {
			await this.ensureParents(id);
			await this.extendObjectAsync(id, {
				type: 'state',
				common: {
					name,
					type,
					role,
					read: true,
					write: false,
					...(unit ? { unit } : {}),
				},
				native: {},
			});
			this.knownStates.add(id);
		}
		await this.setState(id, { val, ack: true });
	}

	/**
	 * Legt fehlende Ordner oberhalb eines Objekts an. Laut ioBroker-Regeln sollen Unterstrukturen
	 * aus Objekten vom Typ folder, channel oder device bestehen und Datenpunkte nur auf der letzten Ebene liegen.
	 *
	 * @param {string} id - ID des Datenpunkts oder Kanals
	 */
	async ensureParents(id) {
		const parts = id.split('.');
		for (let i = 1; i < parts.length; i++) {
			const parentId = parts.slice(0, i).join('.');
			if (this.knownObjects.has(parentId)) {
				continue;
			}
			await this.extendObjectAsync(parentId, {
				type: 'folder',
				common: { name: folderName(parts[i - 1]) },
				native: {},
			});
			this.knownObjects.add(parentId);
		}
	}

	/**
	 * Legt einen Kanal an, der mehrere Werte einer API-Antwort zusammenfasst (z. B. Energiezähler, Verlaufsdaten).
	 *
	 * @param {string} id - ID des Kanals
	 * @param {ioBroker.StringOrTranslated} name - Name des Kanals
	 */
	async ensureChannel(id, name) {
		if (this.knownObjects.has(id)) {
			return;
		}
		await this.ensureParents(id);
		await this.extendObjectAsync(id, { type: 'channel', common: { name }, native: {} });
		this.knownObjects.add(id);
	}

	/**
	 * Schreibt eine API-Antwort in den passenden Datenpunkt.
	 *
	 * @param {string} apiPath - API-Pfad, z. B. /signals/SRC.OutdoorTemp
	 * @param {any} data - Antwortobjekt der API
	 */
	async writeState(apiPath, data) {
		if (data.type === 'emonValue' && Array.isArray(data.values)) {
			await this.writeEnergyCounters(apiPath, data);
			return;
		}
		const raw = data.value;
		const isNumberType = data.type === 'floatValue' || data.type === 'integerValue';
		if (!isNumberType && (raw === undefined || raw === null || typeof raw === 'object')) {
			await this.writeComplex(apiPath, data);
			return;
		}
		const { val, type, unit } = this.convertValue(data);
		const role = type === 'boolean' ? 'indicator' : type === 'number' ? numberRole(unit, apiPath) : 'text';
		await this.setValue(toId(apiPath), nameFor(apiPath), val, type, role, unit);
	}

	/**
	 * Energiezähler (z. B. Gesamtverbrauch) in einzelne Datenpunkte aufteilen.
	 *
	 * @param {string} apiPath - API-Pfad, z. B. /heatSources/emon/totalConsumption
	 * @param {any} data - Antwortobjekt der API
	 */
	async writeEnergyCounters(apiPath, data) {
		const base = toId(apiPath);
		await this.replaceLegacyState(base);
		await this.ensureChannel(base, nameFor(apiPath));
		const unit = normalizeUnit(data.unit);
		const role = numberRole(unit, apiPath);
		for (const entry of data.values) {
			for (const [key, value] of Object.entries(entry ?? {})) {
				const counterId = `${base}.${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
				const name = withPart(nameFor(apiPath), names.keys[key] ?? key);
				await this.setValue(counterId, name, Number(value), 'number', role, unit);
			}
		}
	}

	/**
	 * Entfernt einmalig einen Textdatenpunkt aus früheren Versionen, damit darunter einzelne Werte angelegt werden können.
	 *
	 * @param {string} base - Datenpunkt-ID
	 */
	async replaceLegacyState(base) {
		if (this.expandedStates.has(base)) {
			return;
		}
		this.expandedStates.add(base);
		const obj = await this.getObjectAsync(base);
		if (obj && obj.type === 'state') {
			await this.delObjectAsync(base);
		}
		this.knownStates.delete(base);
	}

	/**
	 * Zusammengesetzte Antworten (z. B. Fehlermeldungen, Systeminfos) in einzelne Datenpunkte zerlegen.
	 * Zusätzlich wird die vollständige Antwort als JSON-Text abgelegt.
	 *
	 * @param {string} apiPath - API-Pfad, z. B. /system/basicInfo
	 * @param {any} data - Antwortobjekt der API
	 */
	async writeComplex(apiPath, data) {
		const base = toId(apiPath);
		await this.replaceLegacyState(base);

		const content = { ...data };
		delete content.id;
		delete content.writeable;
		delete content.type;
		const baseName = nameFor(apiPath);
		await this.ensureChannel(base, baseName);
		const jsonName = withPart(baseName, names.suffixes.json);
		await this.setValue(`${base}.json`, jsonName, JSON.stringify(content), 'string', 'json');

		/** @type {[string, string | number | boolean][]} */
		const leaves = [];
		flatten(content, '', leaves);
		const current = new Set();
		for (const [path, value] of leaves) {
			const id = `${base}.${path}`;
			const name = withPart(baseName, path);
			current.add(id);
			if (value === 'true' || value === 'false' || typeof value === 'boolean') {
				await this.setValue(id, name, value === true || value === 'true', 'boolean', 'indicator');
			} else if (typeof value === 'number') {
				await this.setValue(id, name, value, 'number', 'value');
			} else {
				await this.setValue(id, name, String(value), 'string', 'text');
			}
		}
		// Werte, die in der Antwort nicht mehr vorkommen (z. B. behobene Fehlermeldungen), leeren
		for (const id of this.complexLeaves.get(base) ?? []) {
			if (!current.has(id)) {
				await this.setState(id, { val: null, ack: true });
			}
		}
		this.complexLeaves.set(base, current);
	}

	/**
	 * Fragt Verlaufsdaten ab (Tageswerte der letzten 31 Tage, Monatswerte der letzten 12 Monate)
	 * und schreibt sie in Datenpunkte. Temperaturen als Durchschnitt, Energie, Starts und Laufzeiten als Summe.
	 *
	 * @param {string} apiPath - Pfad, z. B. /recordings/heatSources/emon/total/compressor
	 * @returns {Promise<boolean>} true, wenn es diese Verlaufsdaten bei der Anlage gibt
	 */
	async pollRecording(apiPath) {
		const now = new Date();
		const dayStart = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
		const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 11, 1));

		const daily = await this.apiGet(`${apiPath}?sampleRate=P1D&startDate=${dayStart}`);
		const monthly = await this.apiGet(`${apiPath}?sampleRate=P1M&startDate=${monthStart}`);
		if (!daily && !monthly) {
			return false;
		}

		const unit = normalizeUnit((daily ?? monthly).unitOfMeasure);
		const average = AVERAGE_UNITS.includes(unit ?? '');
		const dailySeries = extractSeries(daily, 'P1D', average);
		const monthlySeries = extractSeries(monthly, 'P1M', average);
		const lastDay = dailySeries[dailySeries.length - 1];
		const lastMonth = monthlySeries[monthlySeries.length - 1];
		const today = formatDate(now);

		const base = toId(apiPath);
		const baseName = nameFor(apiPath);
		const role = numberRole(unit, apiPath);
		await this.ensureChannel(base, baseName);
		if (daily) {
			await this.setValue(
				`${base}.daily`,
				withPart(baseName, names.suffixes.daily),
				JSON.stringify(dailySeries),
				'string',
				'json',
			);
			await this.setValue(
				`${base}.today`,
				withPart(baseName, names.suffixes.today),
				lastDay?.date === today ? lastDay.value : null,
				'number',
				role,
				unit,
			);
		}
		if (monthly) {
			await this.setValue(
				`${base}.monthly`,
				withPart(baseName, names.suffixes.monthly),
				JSON.stringify(monthlySeries),
				'string',
				'json',
			);
			await this.setValue(
				`${base}.thisMonth`,
				withPart(baseName, names.suffixes.thisMonth),
				lastMonth?.date === today.slice(0, 7) ? lastMonth.value : null,
				'number',
				role,
				unit,
			);
		}
		return true;
	}

	/**
	 * Fragt einen Pfad ab und schreibt den Wert in den Datenpunkt.
	 *
	 * @param {string} apiPath - API-Pfad
	 * @returns {Promise<boolean>} true, wenn es den Pfad bei der Anlage gibt
	 */
	async pollOne(apiPath) {
		if (apiPath.startsWith('/recordings/')) {
			return this.pollRecording(apiPath);
		}
		const data = await this.apiGet(apiPath);
		if (!data) {
			return false;
		}
		await this.writeState(apiPath, data);
		return true;
	}

	/**
	 * Setzt den Verbindungsanzeiger (info.connection), aber nur bei einer Änderung.
	 *
	 * @param {boolean} connected - true, wenn die MX400 antwortet
	 */
	async setConnected(connected) {
		if (this.connected === connected) {
			return;
		}
		this.connected = connected;
		await this.setState('info.connection', { val: connected, ack: true });
	}

	/**
	 * Fragt eine Liste von Pfaden ab und schreibt die Werte in die Datenpunkte.
	 *
	 * @param {string[]} paths - API-Pfade
	 */
	async pollPaths(paths) {
		for (const apiPath of paths) {
			if (this.unloaded) {
				return;
			}
			try {
				await this.pollOne(apiPath);
			} catch (error) {
				this.log.debug(`${apiPath}: ${error.message}`);
			}
			await new Promise(resolve => this.setTimeout(() => resolve(undefined), 50));
		}
	}

	/**
	 * Probiert alle festen Pfade aus endpoints.json einmal aus und merkt sich die,
	 * die es bei dieser Anlage gibt (alle anderen antworten mit 404).
	 * Bricht ab, wenn das Gerät mehrmals hintereinander nicht antwortet.
	 */
	async discoverFixedPaths() {
		const fast = [];
		const slow = [];
		const failed = [];
		let notPresent = 0;
		let errors = 0;
		for (const apiPath of endpoints) {
			if (this.unloaded) {
				return;
			}
			try {
				const exists = await this.pollOne(apiPath);
				errors = 0;
				if (exists) {
					(isSlowPath(apiPath) ? slow : fast).push(apiPath);
				} else {
					notPresent++;
				}
			} catch (error) {
				this.log.debug(`${apiPath}: ${error.message}`);
				failed.push(apiPath);
				errors++;
				if (errors >= 5) {
					this.log.warn(
						'Suche nach festen Pfaden abgebrochen, das Gerät antwortet nicht. Neuer Versuch folgt.',
					);
					return;
				}
			}
			await new Promise(resolve => this.setTimeout(() => resolve(undefined), 20));
		}
		this.fixedPaths = fast;
		this.slowPaths = slow;
		this.retryPaths = failed;
		this.lastSlowPoll = Date.now();
		this.discovered = true;
		this.log.info(
			`Suche abgeschlossen: ${endpoints.length} Pfade geprüft, ${fast.length + slow.length} vorhanden ` +
				`(davon ${slow.length} stündlich), ${notPresent} bei dieser Anlage nicht vorhanden, ` +
				`${failed.length} ohne Antwort`,
		);
		if (failed.length) {
			this.log.info(`Ohne Antwort (werden stündlich erneut versucht): ${failed.join(', ')}`);
		}
	}

	/**
	 * Versucht Pfade erneut, die bei der Suche nicht geantwortet haben.
	 * Vorhandene werden in die normale Abfrage übernommen, nicht vorhandene aussortiert.
	 */
	async retryFailedPaths() {
		const stillFailing = [];
		for (const apiPath of this.retryPaths) {
			if (this.unloaded) {
				return;
			}
			try {
				if (await this.pollOne(apiPath)) {
					(isSlowPath(apiPath) ? this.slowPaths : this.fixedPaths).push(apiPath);
					this.log.info(`Pfad nachträglich gefunden: ${apiPath}`);
				}
			} catch (error) {
				this.log.debug(`${apiPath}: ${error.message}`);
				stillFailing.push(apiPath);
			}
			await new Promise(resolve => this.setTimeout(() => resolve(undefined), 50));
		}
		this.retryPaths = stillFailing;
	}

	/**
	 * Ein Abfragedurchlauf: Signalliste holen, alle Werte lesen und den nächsten Durchlauf planen.
	 */
	async pollCycle() {
		try {
			const signals = await this.apiGet('/signals');
			if (!signals) {
				throw new Error('Signalliste nicht verfügbar');
			}
			const ids = (signals.references ?? []).map((/** @type {{ id: string }} */ ref) => ref.id);
			if (this.connected === false) {
				this.log.info('Verbindung zur MX400 hergestellt');
			}
			await this.setConnected(true);

			let fixed = this.fixedPaths;
			let slow = /** @type {string[]} */ ([]);
			if (!this.discovered) {
				// Beim ersten erfolgreichen Durchlauf werden die vorhandenen festen Pfade gesucht
				await this.discoverFixedPaths();
				fixed = [];
			} else if (Date.now() - this.lastSlowPoll >= SLOW_INTERVAL_MS) {
				slow = this.slowPaths;
				this.lastSlowPoll = Date.now();
				if (this.retryPaths.length) {
					await this.retryFailedPaths();
				}
			}
			await this.pollPaths([...ids, ...fixed, ...slow]);
			this.log.debug(`${ids.length + fixed.length + slow.length} Werte aktualisiert`);
		} catch (error) {
			if (this.connected !== false) {
				this.log.warn(`Verbindung zur MX400 verloren: ${error.message}`);
			} else {
				this.log.debug(`Abfrage fehlgeschlagen: ${error.message}`);
			}
			await this.setConnected(false);
		}
		if (this.unloaded) {
			return;
		}
		const seconds = Math.max(10, Number(this.config.interval) || 60);
		this.pollTimer = this.setTimeout(() => this.pollCycle(), seconds * 1000);
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		await this.extendObjectAsync('info', {
			type: 'channel',
			common: { name: { en: 'Information', de: 'Informationen' } },
			native: {},
		});
		await this.extendObjectAsync('info.connection', {
			type: 'state',
			common: {
				name: { en: 'Connection to the MX400', de: 'Verbindung zur MX400' },
				type: 'boolean',
				role: 'indicator.connected',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});
		await this.setConnected(false);

		if (!this.config.ip || !this.config.token) {
			this.log.error('Bitte IP-Adresse und Token in den Adaptereinstellungen eintragen.');
			return;
		}

		try {
			const brand = await this.apiGet('/gateway/brand');
			this.log.info(`Verbindung erfolgreich, Hersteller: ${brand?.value}`);
		} catch (error) {
			this.log.error(`Verbindung zur MX400 fehlgeschlagen: ${error.message}`);
		}

		// Startet die regelmäßige Abfrage. Schlägt ein Durchlauf fehl, wird es automatisch erneut versucht.
		await this.pollCycle();
		this.log.info(`${this.knownStates.size} Datenpunkte angelegt, Abfrage läuft im eingestellten Intervall`);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
			this.unloaded = true;
			if (this.pollTimer) {
				this.clearTimeout(this.pollTimer);
				this.pollTimer = undefined;
			}
			void this.setState('info.connection', { val: false, ack: true });
		} finally {
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new BuderusMx400(options);
} else {
	// otherwise start the instance directly
	new BuderusMx400();
}
