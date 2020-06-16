use crate::modules::data::{tools::RetrieveItemInventoryType, Data};
use crate::tests::TestContainer;

#[test]
fn get_item_inventory_type() {
    let container = TestContainer::new(true);
    let (dns, _node) = container.run();

    let data = Data::with_dns((dns + "main").as_str()).init(Some(23));
    let item_inventory_type = data.get_item_inventory_type(1);
    assert!(item_inventory_type.is_some());
    assert_eq!(item_inventory_type.unwrap().id, 1);
    let no_item_inventory_type = data.get_item_inventory_type(0);
    assert!(no_item_inventory_type.is_none());
}

#[test]
fn get_all_item_inventory_types() {
    let container = TestContainer::new(true);
    let (dns, _node) = container.run();

    let data = Data::with_dns((dns + "main").as_str()).init(Some(23));
    let item_inventory_types = data.get_all_item_inventory_types();
    assert!(item_inventory_types.len() > 0);
}
