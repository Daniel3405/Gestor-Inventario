-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema Inventario
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema Inventario
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `Inventario` DEFAULT CHARACTER SET utf8 ;
USE `Inventario` ;

-- -----------------------------------------------------
-- Table `Inventario`.`Producto`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Inventario`.`Producto` (
  `idProducto` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Codigo` VARCHAR(45) NOT NULL,
  `Nombre` VARCHAR(45) NOT NULL,
  `Categoria` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`idProducto`),
  UNIQUE INDEX `idProducto_UNIQUE` (`idProducto` ASC) VISIBLE,
  UNIQUE INDEX `Codigo_UNIQUE` (`Codigo` ASC) VISIBLE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `Inventario`.`Reg_Conteo`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Inventario`.`Reg_Conteo` (
  `idReg_Conteo` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Fecha` DATE NOT NULL,
  `CantidadCont` INT UNSIGNED NOT NULL,
  `Producto_idProducto` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`idReg_Conteo`),
  INDEX `fk_Reg_Conteo_Producto_idx` (`Producto_idProducto` ASC) VISIBLE,
  CONSTRAINT `fk_Reg_Conteo_Producto`
    FOREIGN KEY (`Producto_idProducto`)
    REFERENCES `Inventario`.`Producto` (`idProducto`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `Inventario`.`Reporte_Diferencias`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Inventario`.`Reporte_Diferencias` (
  `idReporte_Diferencias` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Fecha_Generacion` DATE NOT NULL,
  PRIMARY KEY (`idReporte_Diferencias`),
  UNIQUE INDEX `idReporte_Diferencias_UNIQUE` (`idReporte_Diferencias` ASC) VISIBLE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `Inventario`.`Comparacion_Inv`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Inventario`.`Comparacion_Inv` (
  `idComparacion_Inv` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Fecha` DATE NOT NULL,
  `Diferencia` INT NOT NULL,
  `Producto_idProducto` INT UNSIGNED NOT NULL,
  `Reporte_Diferencias_idReporte_Diferencias` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`idComparacion_Inv`),
  UNIQUE INDEX `idComparacion_Inv_UNIQUE` (`idComparacion_Inv` ASC) VISIBLE,
  INDEX `fk_Comparacion_Inv_Producto1_idx` (`Producto_idProducto` ASC) VISIBLE,
  INDEX `fk_Comparacion_Inv_Reporte_Diferencias1_idx` (`Reporte_Diferencias_idReporte_Diferencias` ASC) VISIBLE,
  CONSTRAINT `fk_Comparacion_Inv_Producto1`
    FOREIGN KEY (`Producto_idProducto`)
    REFERENCES `Inventario`.`Producto` (`idProducto`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_Comparacion_Inv_Reporte_Diferencias1`
    FOREIGN KEY (`Reporte_Diferencias_idReporte_Diferencias`)
    REFERENCES `Inventario`.`Reporte_Diferencias` (`idReporte_Diferencias`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `Inventario`.`Stock_Sistema`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Inventario`.`Stock_Sistema` (
  `idStock_Sistema` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Cantidad_Sistema` INT UNSIGNED NOT NULL,
  `Ult_Actualizacion` DATE NOT NULL,
  `Producto_idProducto` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`idStock_Sistema`),
  UNIQUE INDEX `idStock_Sistema_UNIQUE` (`idStock_Sistema` ASC) VISIBLE,
  INDEX `fk_Stock_Sistema_Producto1_idx` (`Producto_idProducto` ASC) VISIBLE,
  CONSTRAINT `fk_Stock_Sistema_Producto1`
    FOREIGN KEY (`Producto_idProducto`)
    REFERENCES `Inventario`.`Producto` (`idProducto`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
