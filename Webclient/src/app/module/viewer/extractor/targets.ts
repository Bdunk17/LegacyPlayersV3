import {Event} from "../domain_value/event";
import {Unit} from "../domain_value/unit";
import {
    get_aura_application,
    get_heal,
    get_melee_damage,
    get_spell_cast,
    get_spell_damage,
    get_summon,
    get_threat
} from "./events";

function te_spell_cast(event: Event): Unit {
    return get_spell_cast(event).victim;
}

function te_aura_application(event: Event): Unit {
    return get_aura_application(event).caster;
}

function te_summon(event: Event): Unit {
    return get_summon(event).summoned;
}

function te_melee_damage(event: Event): Unit {
    return get_melee_damage(event).victim;
}

function te_spell_damage(event: Event): Unit {
    return get_spell_damage(event).damage.victim;
}

function te_heal(event: Event): Unit {
    return get_heal(event).heal.target;
}

function te_threat(event: Event): Unit {
    return get_threat(event).threat.threatened;
}

function te_spell_cast_by_cause(cause_extraction: (Event) => number, spell_casts: Map<number, Event>): (Event) => Unit {
    return (event: Event) => {
        const cause_event_id = cause_extraction(event);
        const spell_cast_event = spell_casts?.get(cause_event_id);
        return te_spell_cast(spell_cast_event);
    };
}

function te_spell_cast_or_aura_app(cause_extraction: (Event) => number, spell_casts: Map<number, Event>, aura_applications: Map<number, Event>): (Event) => Unit {
    return (event: Event) => {
        const cause_event_id = cause_extraction(event);
        const spell_cast_event = spell_casts?.get(cause_event_id);
        if (!!spell_cast_event)
            return te_spell_cast(spell_cast_event);
        const aura_application_event = aura_applications?.get(cause_event_id);
        if (!!aura_application_event)
            return te_aura_application(aura_application_event);
        return undefined;
    };
}

export {te_spell_cast, te_aura_application, te_summon, te_melee_damage, te_spell_damage, te_heal, te_threat};
export {te_spell_cast_by_cause};
export {te_spell_cast_or_aura_app};
