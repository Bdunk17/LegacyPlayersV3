import {InstanceDataFilter} from "../../../tool/instance_data_filter";
import {commit_damage_detail} from "../stdlib/damage_detail";
import {HitType} from "../../../domain_value/hit_type";
import {DetailRow} from "../domain_value/detail_row";
import {MeleeDamage, SpellDamage} from "../../../domain_value/event";

export class RaidDetailDamage {

    constructor(
        private data_filter: InstanceDataFilter
    ) {
    }

    async calculate(inverse: boolean): Promise<Array<[number, Array<[HitType, DetailRow]>]>> {
        if (inverse)
            return commit_damage_detail(this.data_filter.get_spell_damage(true) as Array<SpellDamage>, this.data_filter.get_melee_damage(true) as Array<MeleeDamage>);
        return commit_damage_detail(this.data_filter.get_spell_damage(false) as Array<SpellDamage>, this.data_filter.get_melee_damage(false) as Array<MeleeDamage>);
    }
}
