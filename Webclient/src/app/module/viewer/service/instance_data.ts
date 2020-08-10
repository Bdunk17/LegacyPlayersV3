import {Injectable, OnDestroy} from "@angular/core";
import {APIService} from "src/app/service/api";
import {Observable, BehaviorSubject, Subject, Subscription} from "rxjs";
import {Event} from "../domain_value/event";
import {InstanceViewerMeta} from "../domain_value/instance_viewer_meta";
import {SettingsService} from "src/app/service/settings";
import {InstanceViewerParticipants} from "../domain_value/instance_viewer_participants";
import {InstanceViewerAttempt} from "../domain_value/instance_viewer_attempt";
import {get_unit_id, has_unit, Unit} from "../domain_value/unit";
import {SpellCast} from "../domain_value/spell_cast";
import {AuraApplication} from "../domain_value/aura_application";
import {MeleeDamage} from "../domain_value/melee_damage";
import {SpellDamage} from "../domain_value/spell_damage";
import {Heal} from "../domain_value/heal";
import {Threat} from "../domain_value/threat";
import {Summon} from "../domain_value/summon";
import {map, take} from "rxjs/operators";
import {Interrupt} from "../domain_value/interrupt";
import {SpellSteal} from "../domain_value/spell_steal";
import {Dispel} from "../domain_value/dispel";

export enum ChangedSubject {
    SpellCast = 1,
    Death = 2,
    CombatState,
    Loot,
    Position,
    Power,
    AuraApplication,
    Interrupt,
    SpellSteal,
    Dispel,
    ThreatWipe,
    Summon,
    MeleeDamage,
    SpellDamage,
    Heal,
    Threat,
    InstanceMeta,
    Participants,
    Attempts,
    Sources,
    Targets,
    Abilities,
    AttemptTotalDuration
}

@Injectable({
    providedIn: "root",
})
export class InstanceDataService implements OnDestroy {
    private static INSTANCE_EXPORT_URL: string = "/instance/export/:instance_meta_id/:event_type/:last_event_id";
    private static INSTANCE_EXPORT_META_URL: string = "/instance/export/:instance_meta_id";
    private static INSTANCE_EXPORT_PARTICIPANTS_URL: string = "/instance/export/participants/:instance_meta_id";
    private static INSTANCE_EXPORT_ATTEMPTS_URL: string = "/instance/export/attempts/:instance_meta_id";

    private subscriptions: Array<Subscription> = [];

    private instance_meta_id$: number;

    // Map subjects are referenced by some other object
    // Threrefore they have an efficient ID lookup
    private spell_casts$: BehaviorSubject<Map<number, Event>>;
    private aura_applications$: BehaviorSubject<Map<number, Event>>;
    private melee_damage$: BehaviorSubject<Map<number, Event>>;
    private deaths$: BehaviorSubject<Array<Event>>;
    private combat_states$: BehaviorSubject<Array<Event>>;
    private loot$: BehaviorSubject<Array<Event>>;
    private positions$: BehaviorSubject<Array<Event>>;
    private powers$: BehaviorSubject<Array<Event>>;
    private interrupts$: BehaviorSubject<Array<Event>>;
    private spell_steals$: BehaviorSubject<Array<Event>>;
    private dispels$: BehaviorSubject<Array<Event>>;
    private threat_wipes$: BehaviorSubject<Array<Event>>;
    private summons$: BehaviorSubject<Array<Event>>;
    private spell_damage$: BehaviorSubject<Array<Event>>;
    private heal$: BehaviorSubject<Array<Event>>;
    private threat$: BehaviorSubject<Array<Event>>;
    private instance_meta$: BehaviorSubject<InstanceViewerMeta>;
    private participants$: BehaviorSubject<Array<InstanceViewerParticipants>>;
    private attempts$: BehaviorSubject<Array<InstanceViewerAttempt>>;

    private attempt_intervals$: Array<[number, number]> = [];
    private sources$: BehaviorSubject<Array<Unit>> = new BehaviorSubject([]);
    private source_filter$: Set<number> = new Set();
    private targets$: BehaviorSubject<Array<Unit>> = new BehaviorSubject([]);
    private target_filter$: Set<number> = new Set();
    private abilities$: BehaviorSubject<Set<number>> = new BehaviorSubject(new Set());
    private ability_filter$: Set<number> = new Set();

    private attempt_total_duration$: BehaviorSubject<number> = new BehaviorSubject(1);

    private changed$: Subject<ChangedSubject> = new Subject();
    private registered_subjects: Array<[number, BehaviorSubject<Array<Event> | Map<number, Event>>]> = [];
    private readonly updater: any;

    constructor(
        private apiService: APIService
    ) {
        this.updater = setInterval(() => {
            this.load_instance_meta(meta => {
                const current_meta = this.instance_meta$.getValue();
                if (current_meta.end_ts !== meta.end_ts) {
                    this.instance_meta$.next(meta);
                    this.changed$.next(ChangedSubject.InstanceMeta);
                }
            });
            this.load_attempts(attempts => {
                if (attempts.length > this.attempts$.getValue().length) {
                    this.attempts$.next(attempts);
                    this.changed$.next(ChangedSubject.Attempts);
                }
            });
            for (const [event_type, subject] of this.registered_subjects) {
                let subject_value = subject.getValue();
                const last_event_id = subject_value instanceof Map ?
                    [...subject_value.keys()].reduce((highest, id) => Math.max(highest, id), 0) :
                    (subject_value.length > 0 ? subject_value[subject_value.length - 1].id : 0);
                this.load_instance_data(event_type, (result: Array<Event>) => {
                    if (result.length > 0) {
                        if (subject_value instanceof Map)
                            result.forEach(event => (subject_value as Map<number, Event>).set(event.id, event));
                        else subject_value = subject_value.concat(result);
                        subject.next(subject_value);
                        this.changed$.next(event_type + 1);
                    }
                }, last_event_id);
            }
        }, 60000);
    }

    ngOnDestroy(): void {
        for (const subscription of this.subscriptions)
            subscription.unsubscribe();
        clearInterval(this.updater);
    }

    private register_load_instance(event_type: number, subject: BehaviorSubject<Array<Event> | Map<number, Event>>): void {
        if (!this.registered_subjects.find(([i_event_type, i_subject]) => i_event_type === event_type))
            this.registered_subjects.push([event_type, subject]);
    }

    private load_instance_data(event_type: number, on_success: any, last_event_id: number): void {
        if (!this.instance_meta_id$)
            return;

        return this.apiService.get(
            InstanceDataService.INSTANCE_EXPORT_URL
                .replace(":instance_meta_id", this.instance_meta_id$.toString())
                .replace(":event_type", event_type.toString())
                .replace(":last_event_id", last_event_id.toString()),
            on_success, () => {
            }
        );
    }

    private load_instance_meta(on_success: any): void {
        if (!this.instance_meta_id$)
            return;

        return this.apiService.get(
            InstanceDataService.INSTANCE_EXPORT_META_URL
                .replace(":instance_meta_id", this.instance_meta_id$.toString()),
            on_success, () => {
            }
        );
    }

    private load_participants(on_success: any): void {
        if (!this.instance_meta_id$)
            return;

        return this.apiService.get(
            InstanceDataService.INSTANCE_EXPORT_PARTICIPANTS_URL
                .replace(":instance_meta_id", this.instance_meta_id$.toString()),
            on_success, () => {
            }
        );
    }

    private load_attempts(on_success: any): void {
        if (!this.instance_meta_id$)
            return;

        return this.apiService.get(
            InstanceDataService.INSTANCE_EXPORT_ATTEMPTS_URL
                .replace(":instance_meta_id", this.instance_meta_id$.toString()),
            on_success, () => {
            }
        );
    }

    private extract_subjects(events: Array<Event>, source_extractor: (Event) => Unit, target_extractor: (Event) => Unit, ability_extractor: (Event) => Array<number>): void {
        if (!source_extractor)
            source_extractor = (event) => event.subject;

        const current_sources = this.sources$.getValue();
        const current_targets = this.targets$.getValue();
        const current_abilities = this.abilities$.getValue();
        for (const event of events) {
            if (this.attempt_intervals$.find(interval => interval[0] <= event.timestamp && interval[1] >= event.timestamp) === undefined)
                continue;

            const source = source_extractor(event);
            if (!has_unit(current_sources, source))
                current_sources.push(source);

            if (!!target_extractor) {
                const target = target_extractor(event);
                if (!!target && !has_unit(current_targets, target))
                    current_targets.push(target);
            }

            if (!!ability_extractor) {
                const abilities = ability_extractor(event);
                for (const ability of abilities)
                    if ((!!ability || ability === 0) && !current_abilities.has(ability))
                        current_abilities.add(ability);
            }
        }
        this.sources$.next(current_sources);
        this.targets$.next(current_targets);
        this.abilities$.next(current_abilities);
        this.changed$.next(ChangedSubject.Sources);
        this.changed$.next(ChangedSubject.Targets);
        this.changed$.next(ChangedSubject.Abilities);
    }

    // Lets see how that performs :'D
    private fire_subjects_filter_changed(): void {
        if (!!this.spell_casts$) this.changed$.next(ChangedSubject.SpellCast);
        if (!!this.deaths$) this.changed$.next(ChangedSubject.Death);
        if (!!this.combat_states$) this.changed$.next(ChangedSubject.CombatState);
        if (!!this.loot$) this.changed$.next(ChangedSubject.Loot);
        if (!!this.positions$) this.changed$.next(ChangedSubject.Position);
        if (!!this.powers$) this.changed$.next(ChangedSubject.Power);
        if (!!this.aura_applications$) this.changed$.next(ChangedSubject.AuraApplication);
        if (!!this.interrupts$) this.changed$.next(ChangedSubject.Interrupt);
        if (!!this.spell_steals$) this.changed$.next(ChangedSubject.SpellSteal);
        if (!!this.dispels$) this.changed$.next(ChangedSubject.Dispel);
        if (!!this.threat_wipes$) this.changed$.next(ChangedSubject.ThreatWipe);
        if (!!this.summons$) this.changed$.next(ChangedSubject.Summon);
        if (!!this.melee_damage$) this.changed$.next(ChangedSubject.MeleeDamage);
        if (!!this.spell_damage$) this.changed$.next(ChangedSubject.SpellDamage);
        if (!!this.heal$) this.changed$.next(ChangedSubject.Heal);
        if (!!this.threat$) this.changed$.next(ChangedSubject.Threat);
    }

    public set attempt_intervals(intervals: Array<[number, number]>) {
        this.attempt_intervals$ = intervals;
        this.attempt_total_duration$.next(intervals.reduce((acc, [start, end]) => acc + end - start, 1));
        this.changed$.next(ChangedSubject.AttemptTotalDuration);

        // Update sources and targets
        this.sources$.next([]);
        this.targets$.next([]);
        this.spell_casts$?.next(this.spell_casts$.getValue());
        this.deaths$?.next(this.deaths$.getValue());
        this.combat_states$?.next(this.combat_states$.getValue());
        this.loot$?.next(this.loot$.getValue());
        this.positions$?.next(this.positions$.getValue());
        this.powers$?.next(this.powers$.getValue());
        this.aura_applications$?.next(this.aura_applications$.getValue());
        this.interrupts$?.next(this.interrupts$.getValue());
        this.spell_steals$?.next(this.spell_steals$.getValue());
        this.dispels$?.next(this.dispels$.getValue());
        this.threat_wipes$?.next(this.threat_wipes$.getValue());
        this.summons$?.next(this.summons$.getValue());
        this.melee_damage$?.next(this.melee_damage$.getValue());
        this.spell_damage$?.next(this.spell_damage$.getValue());
        this.heal$?.next(this.heal$.getValue());
        this.threat$?.next(this.threat$.getValue());
    }

    public set source_filter(filtered_sources: Array<number>) {
        this.source_filter$ = new Set(filtered_sources);
        this.fire_subjects_filter_changed();
    }

    public set target_filter(filtered_targets: Array<number>) {
        this.target_filter$ = new Set(filtered_targets);
        this.fire_subjects_filter_changed();
    }

    public set ability_filter(filtered_abilities: Array<number>) {
        this.ability_filter$ = new Set(filtered_abilities);
        this.fire_subjects_filter_changed();
    }

    public set instance_meta_id(instance_meta_id: number) {
        this.instance_meta_id$ = instance_meta_id;
    }

    private apply_filter_to_events(subject: Observable<Array<Event>>, source_extraction: (Event) => Unit,
                                   target_extraction: (Event) => Unit, ability_extraction: (Event) => Array<number>): Observable<Array<Event>> {
        return this.apply_ability_filter_to_events(
            this.apply_target_filter_to_events(
                this.apply_interval_and_source_filter_to_events(subject, source_extraction),
                target_extraction),
            ability_extraction);
    }

    private apply_filter_to_events_map(subject: Observable<Map<number, Event>>, source_extraction: (Event) => Unit,
                                       target_extraction: (Event) => Unit, ability_extraction: (Event) => Array<number>): Observable<Map<number, Event>> {
        if (!source_extraction)
            source_extraction = (event) => event.subject;

        // Not sure how this will be performance wise
        return subject;
        return subject.pipe(
            map(events => [...events]),
            map(events => events.filter(([id, event]) => this.attempt_intervals$.find(interval => interval[0] <= event.timestamp && interval[1] >= event.timestamp) !== undefined)),
            map(events => events.filter(([id, event]) => this.source_filter$.has(get_unit_id(source_extraction(event))))),
            map(events => events.filter(([id, event]) => get_unit_id(event.subject) === get_unit_id(target_extraction(event)) || this.target_filter$.has(get_unit_id(target_extraction(event))))),
            map(events => events.filter(([id, event]) => ability_extraction(event).every(ability => this.ability_filter$.has(ability)))),
            map(events => new Map(events))
        );
    }

    private apply_interval_and_source_filter_to_events(subject: Observable<Array<Event>>, source_extraction: (Event) => Unit): Observable<Array<Event>> {
        if (!source_extraction)
            source_extraction = (event) => event.subject;

        return subject.pipe(
            map(events => events.filter(event => this.attempt_intervals$.find(interval => interval[0] <= event.timestamp && interval[1] >= event.timestamp) !== undefined)),
            map(events => events.filter(event => this.source_filter$.has(get_unit_id(source_extraction(event)))))
        );
    }

    private apply_target_filter_to_events(subject: Observable<Array<Event>>, target_extraction: (Event) => Unit): Observable<Array<Event>> {
        return subject.pipe(map(events => events.filter(event => get_unit_id(event.subject) === get_unit_id(target_extraction(event)) ||
            this.target_filter$.has(get_unit_id(target_extraction(event))))));
    }

    private apply_ability_filter_to_events(subject: Observable<Array<Event>>, ability_extraction: (Event) => Array<number>): Observable<Array<Event>> {
        return subject.pipe(map(events => events.filter(event => ability_extraction(event).every(ability => this.ability_filter$.has(ability)))));
    }

    public get spell_casts(): Observable<Map<number, Event>> {
        const target_extraction = (event: Event) => ((event.event as any).SpellCast as SpellCast).victim;
        const ability_extraction = (event: Event) => [((event.event as any).SpellCast as SpellCast).spell_id];
        if (!this.spell_casts$) {
            this.spell_casts$ = new BehaviorSubject(new Map());
            this.load_instance_data(0, events => {
                this.subscriptions.push(this.spell_casts$.subscribe(i_events =>
                    this.extract_subjects([...i_events.values()], undefined, target_extraction, ability_extraction)));
                this.spell_casts$.next(events.reduce((result, event) => {
                    result.set(event.id, event);
                    return result;
                }, new Map()));
                this.changed$.next(ChangedSubject.SpellCast);

                // To solve dependency issues
                this.interrupts$?.next(this.interrupts$.getValue());
                this.spell_steals$?.next(this.spell_steals$.getValue());
                this.dispels$?.next(this.dispels$.getValue());
                this.spell_damage$?.next(this.spell_damage$.getValue());
                this.heal$?.next(this.heal$.getValue());
                this.threat$?.next(this.threat$.getValue());

                this.register_load_instance(0, this.spell_casts$);
            }, 0);
        }
        return this.apply_filter_to_events_map(this.spell_casts$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get deaths(): Observable<Array<Event>> {
        if (!this.deaths$) {
            this.deaths$ = new BehaviorSubject([]);
            this.load_instance_data(1, events => {
                this.subscriptions.push(this.deaths$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.deaths$.next(events);
                this.changed$.next(ChangedSubject.Death);
                this.register_load_instance(1, this.deaths$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.deaths$.asObservable(), undefined);
    }

    public get combat_states(): Observable<Array<Event>> {
        if (!this.combat_states$) {
            this.combat_states$ = new BehaviorSubject([]);
            this.load_instance_data(2, events => {
                this.subscriptions.push(this.combat_states$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.combat_states$.next(events);
                this.changed$.next(ChangedSubject.CombatState);
                this.register_load_instance(2, this.combat_states$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.combat_states$.asObservable(), undefined);
    }

    public get loot(): Observable<Array<Event>> {
        if (!this.loot$) {
            this.loot$ = new BehaviorSubject([]);
            this.load_instance_data(3, events => {
                this.subscriptions.push(this.loot$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.loot$.next(events);
                this.changed$.next(ChangedSubject.Loot);
                this.register_load_instance(3, this.loot$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.loot$.asObservable(), undefined);
    }

    public get positions(): Observable<Array<Event>> {
        if (!this.positions$) {
            this.positions$ = new BehaviorSubject([]);
            this.load_instance_data(4, events => {
                this.subscriptions.push(this.positions$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.positions$.next(events);
                this.changed$.next(ChangedSubject.Position);
                this.register_load_instance(4, this.positions$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.positions$.asObservable(), undefined);
    }

    public get powers(): Observable<Array<Event>> {
        if (!this.powers$) {
            this.powers$ = new BehaviorSubject([]);
            this.load_instance_data(5, events => {
                this.subscriptions.push(this.powers$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.powers$.next(events);
                this.changed$.next(ChangedSubject.Power);
                this.register_load_instance(5, this.powers$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.powers$.asObservable(), undefined);
    }

    public get aura_applications(): Observable<Map<number, Event>> {
        const target_extraction = (event: Event) => ((event.event as any).AuraApplication as AuraApplication).caster;
        const ability_extraction = (event: Event) => [((event.event as any).AuraApplication as AuraApplication).spell_id];
        if (!this.aura_applications$) {
            this.aura_applications$ = new BehaviorSubject(new Map());
            this.load_instance_data(6, events => {
                this.subscriptions.push(this.aura_applications$.subscribe(i_events =>
                    this.extract_subjects([...i_events.values()], undefined, target_extraction, ability_extraction)));
                this.aura_applications$.next(events.reduce((result, event) => {
                    result.set(event.id, event);
                    return result;
                }, new Map()));
                this.changed$.next(ChangedSubject.AuraApplication);

                // To solve dependency issues
                this.interrupts$?.next(this.interrupts$.getValue());
                this.spell_steals$?.next(this.spell_steals$.getValue());
                this.dispels$?.next(this.dispels$.getValue());

                this.register_load_instance(6, this.aura_applications$);
            }, 0);
        }
        return this.apply_filter_to_events_map(this.aura_applications$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get interrupts(): Observable<Array<Event>> {
        const target_extraction = (event: Event) => {
            const interrupt = (event.event as any).Interrupt as Interrupt;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(interrupt.cause_event_id);
            if (!!spell_cast_event)
                return (spell_cast_event.event as any).SpellCast.victim;
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(interrupt.cause_event_id);
            return (aura_application_event?.event as any)?.AuraApplication?.caster;
        };
        const ability_extraction = (event: Event) => {
            const interrupt = (event.event as any).Interrupt as Interrupt;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(interrupt.cause_event_id);
            if (!!spell_cast_event)
                return [(spell_cast_event.event as any).SpellCast.spell_id, interrupt.interrupted_spell_id];
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(interrupt.cause_event_id);
            return [(aura_application_event?.event as any)?.AuraApplication?.spell_id, interrupt.interrupted_spell_id];
        };
        this.spell_casts.pipe(take(1));
        this.aura_applications.pipe(take(1));
        if (!this.interrupts$) {
            this.interrupts$ = new BehaviorSubject([]);
            this.load_instance_data(7, events => {
                this.subscriptions.push(this.interrupts$.subscribe(i_events => this.extract_subjects(i_events, undefined, target_extraction, ability_extraction)));
                this.interrupts$.next(events);
                this.changed$.next(ChangedSubject.Interrupt);
                this.register_load_instance(7, this.interrupts$);
            }, 0);
        }
        return this.apply_filter_to_events(this.interrupts$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get spell_steals(): Observable<Array<Event>> {
        const target_extraction = (event: Event) => {
            const spell_steal = (event.event as any).SpellSteal as SpellSteal;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(spell_steal.cause_event_id);
            return (spell_cast_event?.event as any).SpellCast.victim;
        };
        const ability_extraction = (event: Event) => {
            const spell_steal = (event.event as any).SpellSteal as SpellSteal;
            const spell_casts = this.spell_casts$?.getValue();
            const aura_applications = this.aura_applications$?.getValue();
            const spell_cast_event = spell_casts?.get(spell_steal.cause_event_id);
            const aura_application_event = aura_applications?.get(spell_steal.target_event_id);
            return [(aura_application_event?.event as any)?.AuraApplication?.spell_id, (spell_cast_event?.event as any)?.SpellCast?.spell_id];
        };
        this.spell_casts.pipe(take(1));
        this.aura_applications.pipe(take(1));
        if (!this.spell_steals$) {
            this.spell_steals$ = new BehaviorSubject([]);
            this.load_instance_data(8, events => {
                this.subscriptions.push(this.spell_steals$.subscribe(i_events => this.extract_subjects(i_events, undefined, target_extraction, ability_extraction)));
                this.spell_steals$.next(events);
                this.changed$.next(ChangedSubject.SpellSteal);
                this.register_load_instance(8, this.spell_steals$);
            }, 0);
        }
        return this.apply_filter_to_events(this.spell_steals$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get dispels(): Observable<Array<Event>> {
        const target_extraction = (event: Event) => {
            const dispel = (event.event as any).Dispel as Dispel;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(dispel.cause_event_id);
            return (spell_cast_event?.event as any)?.SpellCast?.victim;
        };
        const ability_extraction = (event: Event) => {
            const dispel = (event.event as any).Dispel as Dispel;
            const spell_casts = this.spell_casts$?.getValue();
            const aura_applications = this.aura_applications$?.getValue();
            const spell_cast_event = spell_casts?.get(dispel.cause_event_id);
            const result = [(spell_cast_event?.event as any)?.SpellCast?.spell_id];
            dispel.target_event_ids.forEach(target_event_id =>
                result.push((aura_applications?.get(target_event_id).event as any).AuraApplication.spell_id));
            return result;
        };
        this.spell_casts.pipe(take(1));
        this.aura_applications.pipe(take(1));
        if (!this.dispels$) {
            this.dispels$ = new BehaviorSubject([]);
            this.load_instance_data(9, events => {
                this.subscriptions.push(this.dispels$.subscribe(i_events => this.extract_subjects(i_events, undefined, target_extraction, ability_extraction)));
                this.dispels$.next(events);
                this.changed$.next(ChangedSubject.Dispel);
                this.register_load_instance(9, this.dispels$);
            }, 0);
        }
        return this.apply_filter_to_events(this.dispels$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get threat_wipes(): Observable<Array<Event>> {
        if (!this.threat_wipes$) {
            this.threat_wipes$ = new BehaviorSubject([]);
            this.load_instance_data(10, events => {
                this.subscriptions.push(this.threat_wipes$.subscribe(i_events => this.extract_subjects(i_events, undefined, undefined, undefined)));
                this.threat_wipes$.next(events);
                this.changed$.next(ChangedSubject.ThreatWipe);
                this.register_load_instance(10, this.threat_wipes$);
            }, 0);
        }
        return this.apply_interval_and_source_filter_to_events(this.threat_wipes$.asObservable(), undefined);
    }

    public get summons(): Observable<Array<Event>> {
        const target_extraction = (event: Event) => ((event.event as any).Summon as Summon).summoned;
        if (!this.summons$) {
            this.summons$ = new BehaviorSubject([]);
            this.load_instance_data(11, events => {
                this.subscriptions.push(this.summons$.subscribe(i_events =>
                    this.extract_subjects(i_events, undefined, target_extraction, undefined)));
                this.summons$.next(events);
                this.changed$.next(ChangedSubject.Summon);
                this.register_load_instance(11, this.summons$);
            }, 0);
        }
        return this.apply_target_filter_to_events(this.apply_interval_and_source_filter_to_events(this.summons$, undefined), target_extraction);
    }

    public get melee_damage(): Observable<Map<number, Event>> {
        const target_extraction = (event: Event) => ((event.event as any).MeleeDamage as MeleeDamage).victim;
        const ability_extraction = (event: Event) => [0];
        if (!this.melee_damage$) {
            this.melee_damage$ = new BehaviorSubject(new Map());
            this.load_instance_data(12, events => {
                this.subscriptions.push(this.melee_damage$.subscribe(i_events =>
                    this.extract_subjects([...i_events.values()], undefined, target_extraction, ability_extraction)));
                this.melee_damage$.next(events.reduce((result, event) => {
                    result.set(event.id, event);
                    return result;
                }, new Map()));
                this.changed$.next(ChangedSubject.MeleeDamage);

                // To solve dependency issues
                this.threat$?.next(this.threat$.getValue());

                this.register_load_instance(12, this.melee_damage$);
            }, 0);
        }
        return this.apply_filter_to_events_map(this.melee_damage$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get spell_damage(): Observable<Array<Event>> {
        const source_extraction = (event: Event) => {
            const spell_damage = (event.event as any).SpellDamage as SpellDamage;
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(spell_damage.spell_cause_id);
            if (!!aura_application_event)
                return ((aura_application_event?.event as any)?.AuraApplication as AuraApplication)?.caster;
            return event.subject;
        };
        const target_extraction = (event: Event) => ((event.event as any).SpellDamage as SpellDamage).damage.victim;
        const ability_extraction = (event: Event) => {
            // TODO: Refactor this extraction mess!
            const spell_damage = (event.event as any).SpellDamage as SpellDamage;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(spell_damage.spell_cause_id);
            if (!!spell_cast_event)
                return [(spell_cast_event?.event as any)?.SpellCast?.spell_id];
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(spell_damage.spell_cause_id);
            return [((aura_application_event?.event as any)?.AuraApplication as AuraApplication)?.spell_id];
        };
        this.aura_applications.pipe(take(1));
        this.spell_casts.pipe(take(1));
        if (!this.spell_damage$) {
            this.spell_damage$ = new BehaviorSubject([]);
            this.load_instance_data(13, events => {
                this.subscriptions.push(this.spell_damage$.subscribe(i_events =>
                    this.extract_subjects(i_events, source_extraction, target_extraction, ability_extraction)));
                this.spell_damage$.next(events);
                this.changed$.next(ChangedSubject.SpellDamage);
                this.register_load_instance(13, this.spell_damage$);
            }, 0);
        }
        return this.apply_filter_to_events(this.spell_damage$.asObservable(), source_extraction, target_extraction, ability_extraction);
    }

    public get heal(): Observable<Array<Event>> {
        const source_extraction = (event: Event) => {
            const heal = (event.event as any).Heal as Heal;
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(heal.spell_cause_id);
            if (!!aura_application_event)
                return ((aura_application_event?.event as any)?.AuraApplication as AuraApplication)?.caster;
            return event.subject;
        };
        const target_extraction = (event: Event) => ((event.event as any).Heal as Heal).heal.target;
        const ability_extraction = (event: Event) => {
            const heal = (event.event as any).Heal as Heal;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(heal.spell_cause_id);
            if (!!spell_cast_event)
                return [(spell_cast_event?.event as any)?.SpellCast?.spell_id];
            const aura_applications = this.aura_applications$?.getValue();
            const aura_application_event = aura_applications?.get(heal.spell_cause_id);
            return [((aura_application_event?.event as any)?.AuraApplication as AuraApplication)?.spell_id];
        };
        this.aura_applications.pipe(take(1));
        this.spell_casts.pipe(take(1));
        if (!this.heal$) {
            this.heal$ = new BehaviorSubject([]);
            this.load_instance_data(14, events => {
                this.subscriptions.push(this.heal$.subscribe(i_events =>
                    this.extract_subjects(i_events, source_extraction, target_extraction, ability_extraction)));
                this.heal$.next(events);
                this.changed$.next(ChangedSubject.Heal);
                this.register_load_instance(14, this.heal$);
            }, 0);
        }
        return this.apply_filter_to_events(this.heal$.asObservable(), source_extraction, target_extraction, ability_extraction);
    }

    public get threat(): Observable<Array<Event>> {
        const target_extraction = (event: Event) => ((event.event as any).Threat as Threat).threat.threatened;
        const ability_extraction = (event: Event) => {
            const threat = (event.event as any).Threat as Threat;
            const spell_casts = this.spell_casts$?.getValue();
            const spell_cast_event = spell_casts?.get(threat.cause_event_id);
            if (!!spell_cast_event)
                return [(spell_cast_event.event as any).SpellCast.spell_id];
            const melee_damage = this.melee_damage$?.getValue();
            const melee_damage_event = melee_damage?.get(threat.cause_event_id);
            if (!!melee_damage_event)
                return [0];
            return [];
        };
        this.spell_casts.pipe(take(1));
        this.melee_damage.pipe(take(1));
        if (!this.threat$) {
            this.threat$ = new BehaviorSubject([]);
            this.load_instance_data(15, events => {
                this.subscriptions.push(this.threat$.subscribe(i_events =>
                    this.extract_subjects(i_events, undefined, target_extraction, ability_extraction)));
                this.threat$.next(events);
                this.changed$.next(ChangedSubject.Threat);
                this.register_load_instance(15, this.threat$);
            }, 0);
        }
        return this.apply_filter_to_events(this.threat$.asObservable(), undefined, target_extraction, ability_extraction);
    }

    public get meta(): Observable<InstanceViewerMeta> {
        if (!this.instance_meta$) {
            this.instance_meta$ = new BehaviorSubject(undefined);
            this.load_instance_meta(meta => {
                this.instance_meta$.next(meta);
                this.changed$.next(ChangedSubject.InstanceMeta);
            });
            this.subscriptions.push(this.instance_meta$.subscribe(meta => {
                if (!!meta && !!meta.expired)
                    clearInterval(this.updater);
            }));
        }
        return this.instance_meta$.asObservable();
    }

    public get participants(): Observable<Array<InstanceViewerParticipants>> {
        if (!this.participants$) {
            this.participants$ = new BehaviorSubject([]);
            this.load_participants(participants => {
                this.participants$.next(participants);
                this.changed$.next(ChangedSubject.Participants);
            });
        }
        return this.participants$.asObservable();
    }

    public get attempts(): Observable<Array<InstanceViewerAttempt>> {
        if (!this.attempts$) {
            this.attempts$ = new BehaviorSubject([]);
            this.load_attempts(attempts => {
                this.attempts$.next(attempts);
                this.changed$.next(ChangedSubject.Attempts);
            });
        }
        return this.attempts$.asObservable();
    }

    public get changed(): Observable<ChangedSubject> {
        return this.changed$.asObservable();
    }

    public get sources(): Observable<Array<Unit>> {
        return this.sources$.asObservable();
    }

    public get targets(): Observable<Array<Unit>> {
        return this.targets$.asObservable();
    }

    public get abilities(): Observable<Set<number>> {
        return this.abilities$.asObservable();
    }

    public get attempt_total_duration(): Observable<number> {
        return this.attempt_total_duration$.asObservable();
    }

}
