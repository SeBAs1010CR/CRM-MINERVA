-- AlterTable
ALTER TABLE `clients` ADD COLUMN `country` VARCHAR(100) NULL,
    ADD COLUMN `sector` VARCHAR(150) NULL;

-- CreateIndex
CREATE INDEX `clients_sector_idx` ON `clients`(`sector`);

-- CreateIndex
CREATE INDEX `clients_country_idx` ON `clients`(`country`);
