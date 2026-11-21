// ============================================================================
// Composants d'emballages, assemblage de casiers, profils bouteilles & casiers
// ============================================================================

mod bottle_profiles;
mod components;
mod crate_assembly;
mod crate_types;
mod dtos;
mod inputs;

pub use bottle_profiles::{
    create_bottle_profile, delete_bottle_profile, get_bottle_profile,
    get_bottle_profiles_by_material, update_bottle_profile,
};
pub use components::{create_crate_component, get_components_overview, update_component_stock};
pub use crate_assembly::{assemble_crates, disassemble_crates};
pub use crate_types::{
    create_crate_type, delete_crate_type, get_crate_type, get_crate_types, update_crate_type,
};
pub use dtos::{
    BottleProfileDto, ComponentType, ContainerTypeDto, CrateAssemblyRecordDto, CrateComponentDto,
    CrateDisassemblyRecordDto, CrateTypeDto, CustomerPackagingComponentBalanceDto,
    DisposablePackagingTypeDto, MovementType, PackagingComponentMovementDto,
    PackagingComponentStockDto, PackagingComponentsOverviewDto, ProductVariantDto,
};
pub use inputs::{
    AssembleCratesInput, CreateBottleProfileInput, CreateCrateComponentInput, CreateCrateTypeInput,
    DisassembleCratesInput, UpdateBottleProfileInput, UpdateComponentStockInput,
    UpdateCrateTypeInput,
};
