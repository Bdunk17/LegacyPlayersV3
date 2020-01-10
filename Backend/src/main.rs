#![feature(proc_macro_hygiene, decl_macro)]
extern crate language;
extern crate mail;
#[macro_use]
extern crate mysql_connection;
extern crate okapi;
#[macro_use]
extern crate rocket;
#[macro_use]
extern crate rocket_okapi;
#[macro_use]
extern crate serde_derive;
extern crate serde_json;
extern crate str_util;
extern crate time_util;
extern crate validator;

use rocket_okapi::swagger_ui::make_swagger_ui;
use rocket_okapi::swagger_ui::SwaggerUIConfig;
use rocket_okapi::swagger_ui::UrlObject;
use rocket_prometheus::PrometheusMetrics;

use crate::modules::account;
use crate::modules::data;

pub mod dto;
pub mod modules;

fn main() {
  let account = account::Account::default().init();
  let data = data::Data::default().init(None);

  let prometheus = PrometheusMetrics::new();
  let mut igniter = rocket::ignite();
  igniter = igniter.manage(account);
  igniter = igniter.manage(data);

  igniter = igniter.attach(prometheus.clone());
  igniter = igniter.mount("/metrics", prometheus);
  igniter = igniter.mount("/API/",
                          make_swagger_ui(&SwaggerUIConfig {
                            url: None,
                            urls: Some(vec![
                              UrlObject {
                                name: "Account".to_string(),
                                url: "/API/account/openapi.json".to_string(),
                              },
                              UrlObject {
                                name: "Data".to_string(),
                                url: "/API/data/openapi.json".to_string(),
                              }
                            ]),
                          }));
  igniter = igniter.mount("/API/account/", routes_with_openapi![
    account::transfer::login::login,
    account::transfer::token::create_token, account::transfer::token::get_tokens, account::transfer::token::delete_token, account::transfer::token::prolong_token,
    account::transfer::delete::request, account::transfer::delete::confirm,
    account::transfer::create::create, account::transfer::create::confirm, account::transfer::create::resend_confirm,
    account::transfer::get::get_account_information,
    account::transfer::forgot::receive_confirmation, account::transfer::forgot::send_confirmation,
    account::transfer::update::request_mail, account::transfer::update::confirm_mail, account::transfer::update::password, account::transfer::update::nickname]);

  igniter = igniter.mount("/API/data/", routes_with_openapi![
    data::transfer::expansion::get_expansion, data::transfer::expansion::get_all_expansions,
    data::transfer::language::get_language, data::transfer::language::get_all_languages,
    data::transfer::localization::get_localization,
    data::transfer::race::get_race, data::transfer::race::get_all_races,
    data::transfer::profession::get_profession, data::transfer::profession::get_all_professions,
    data::transfer::server::get_server, data::transfer::server::get_all_servers,
    data::transfer::hero_class::get_hero_class, data::transfer::hero_class::get_all_hero_classes,
    data::transfer::spell::get_spell,
    data::transfer::dispel_type::get_dispel_type, data::transfer::dispel_type::get_all_dispel_types,
    data::transfer::power_type::get_power_type, data::transfer::power_type::get_all_power_types,
    data::transfer::stat_type::get_stat_type, data::transfer::stat_type::get_all_stat_types,
    data::transfer::spell_effect::get_spell_effects,
    data::transfer::npc::get_npc,
    data::transfer::icon::get_icon,
    data::transfer::item::get_item,
    data::transfer::gem::get_gem,
    data::transfer::enchant::get_enchant,
    data::transfer::item_bonding::get_item_bonding, data::transfer::item_bonding::get_all_item_bondings,
  ]);

  igniter.launch();
}