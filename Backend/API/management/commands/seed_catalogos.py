"""Comando para sembrar los catálogos maestros y datos iniciales de Nicaragua en CAVI.

Uso:
    python manage.py seed_catalogos
"""
from django.core.management.base import BaseCommand
from API.models import (
    CatDepartamento,
    CatMunicipio,
    CatActividadEconomica,
    CatBanco,
    CatEstadoPrestamo,
    CatEstadoCuota,
    CatEstadoCliente,
    CatEstadoCaja,
    CatTipoActividad,
    CatPermiso,
    RolPermiso,
    RolUsuario,
    ConfiguracionSistema
)


class Command(BaseCommand):
    help = 'Puebla los catálogos maestros, estados normativos y permisos por rol en la base de datos.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Iniciando migración y siembra de catálogos maestros..."))

        # 1. Configuración del Sistema (Singleton)
        config = ConfiguracionSistema.get_solo()
        self.stdout.write(f"Configuración del sistema: {config}")

        # 2. Departamentos de Nicaragua
        departamentos_data = [
            (1, "MN", "Managua"),
            (2, "LE", "León"),
            (3, "CH", "Chinandega"),
            (4, "MY", "Masaya"),
            (5, "GR", "Granada"),
            (6, "CA", "Carazo"),
            (7, "RI", "Rivas"),
            (8, "ES", "Estelí"),
            (9, "MD", "Madriz"),
            (10, "NS", "Nueva Segovia"),
            (11, "JI", "Jinotega"),
            (12, "MT", "Matagalpa"),
            (13, "BO", "Boaco"),
            (14, "CT", "Chontales"),
            (15, "SJ", "Río San Juan"),
            (16, "AN", "RACCN"),
            (17, "AS", "RACCS"),
        ]
        dept_objs = {}
        for id_dep, codigo, nombre in departamentos_data:
            obj, _ = CatDepartamento.objects.update_or_create(
                id=id_dep,
                defaults={"codigo": codigo, "nombre": nombre}
            )
            dept_objs[codigo] = obj
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(dept_objs)} departamentos."))

        # 3. Municipios representativos
        municipios_data = [
            # Managua (1)
            (1, dept_objs["MN"], "MN-01", "Managua (Distrito I - VII)"),
            (2, dept_objs["MN"], "MN-02", "Ciudad Sandino"),
            (3, dept_objs["MN"], "MN-03", "Tipitapa"),
            (4, dept_objs["MN"], "MN-04", "Mateare"),
            (5, dept_objs["MN"], "MN-05", "San Rafael del Sur"),
            (6, dept_objs["MN"], "MN-06", "Ticuantepe"),
            (7, dept_objs["MN"], "MN-07", "Villa El Carmen"),
            # León (2)
            (8, dept_objs["LE"], "LE-01", "León"),
            (9, dept_objs["LE"], "LE-02", "Nagarote"),
            (10, dept_objs["LE"], "LE-03", "La Paz Centro"),
            (11, dept_objs["LE"], "LE-04", "Telica"),
            # Chinandega (3)
            (12, dept_objs["CH"], "CH-01", "Chinandega"),
            (13, dept_objs["CH"], "CH-02", "El Viejo"),
            (14, dept_objs["CH"], "CH-03", "Chichigalpa"),
            (15, dept_objs["CH"], "CH-04", "Corinto"),
            # Masaya (4)
            (16, dept_objs["MY"], "MY-01", "Masaya"),
            (17, dept_objs["MY"], "MY-02", "Nindirí"),
            (18, dept_objs["MY"], "MY-03", "Tisma"),
            (19, dept_objs["MY"], "MY-04", "Catarina"),
            (20, dept_objs["MY"], "MY-05", "San Juan de Oriente"),
            (21, dept_objs["MY"], "MY-06", "Masatepe"),
            (22, dept_objs["MY"], "MY-07", "Nandasmo"),
            (23, dept_objs["MY"], "MY-08", "Niquinohomo"),
            (24, dept_objs["MY"], "MY-09", "La Concepción"),
            # Granada (5)
            (25, dept_objs["GR"], "GR-01", "Granada"),
            (26, dept_objs["GR"], "GR-02", "Diriomo"),
            (27, dept_objs["GR"], "GR-03", "Diriá"),
            (28, dept_objs["GR"], "GR-04", "Nandaime"),
            # Carazo (6)
            (29, dept_objs["CA"], "CA-01", "Jinotepe"),
            (30, dept_objs["CA"], "CA-02", "Diriamba"),
            (31, dept_objs["CA"], "CA-03", "San Marcos"),
            # Rivas (7)
            (32, dept_objs["RI"], "RI-01", "Rivas"),
            (33, dept_objs["RI"], "RI-02", "San Juan del Sur"),
            (34, dept_objs["RI"], "RI-03", "Tola"),
            # Estelí (8)
            (35, dept_objs["ES"], "ES-01", "Estelí"),
            (36, dept_objs["ES"], "ES-02", "Condega"),
            (37, dept_objs["ES"], "ES-03", "Pueblo Nuevo"),
            # Matagalpa (12)
            (38, dept_objs["MT"], "MT-01", "Matagalpa"),
            (39, dept_objs["MT"], "MT-02", "Sébaco"),
            (40, dept_objs["MT"], "MT-03", "Ciudad Darío"),
            # Jinotega (11)
            (41, dept_objs["JI"], "JI-01", "Jinotega"),
            (42, dept_objs["JI"], "JI-02", "San Rafael del Norte"),
            # Madriz (9)
            (43, dept_objs["MD"], "MD-01", "Somoto"),
            # Nueva Segovia (10)
            (44, dept_objs["NS"], "NS-01", "Ocotal"),
            # Boaco (13)
            (45, dept_objs["BO"], "BO-01", "Boaco"),
            # Chontales (14)
            (46, dept_objs["CT"], "CT-01", "Juigalpa"),
            # Río San Juan (15)
            (47, dept_objs["SJ"], "SJ-01", "San Carlos"),
            # RACCN (16)
            (48, dept_objs["AN"], "AN-01", "Bilwi / Puerto Cabezas"),
            # RACCS (17)
            (49, dept_objs["AS"], "AS-01", "Bluefields"),
        ]
        for id_mun, dep, codigo, nombre in municipios_data:
            CatMunicipio.objects.update_or_create(
                id=id_mun,
                defaults={"departamento": dep, "codigo": codigo, "nombre": nombre}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(municipios_data)} municipios."))

        # 4. Actividades Económicas
        actividades_data = [
            (1, "COM_PULPERIA", "Comercio / Pulpería", "Comercio Informal"),
            (2, "COM_ROPA", "Venta de Ropa / Bazar", "Comercio Informal"),
            (3, "ALM_COMEDOR", "Comedor / Venta de Alimentos", "Gastronomía"),
            (4, "ALM_PANADERIA", "Panadería / Repostería", "Gastronomía"),
            (5, "SER_TALLER", "Taller Mecánico / Vulcanizadora", "Servicios"),
            (6, "SER_BELLEZA", "Salón de Belleza / Barbería", "Servicios"),
            (7, "TRA_CAPONERA", "Transporte / Moto-taxi / Caponera", "Transporte"),
            (8, "AGR_PRODUCCION", "Producción Agrícola / Granos Básicos", "Agropecuario"),
            (9, "ART_ARTESANIA", "Artesanías / Manualidades", "Manufactura"),
            (10, "SER_OFICIOS", "Albañilería / Carpintería / Oficios", "Servicios"),
            (11, "OTR_VARIOS", "Servicios y Ventas Varias", "Comercio Informal"),
        ]
        for id_act, codigo, nombre, sector in actividades_data:
            CatActividadEconomica.objects.update_or_create(
                id=id_act,
                defaults={"codigo": codigo, "nombre": nombre, "sector": sector}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembradas {len(actividades_data)} actividades económicas."))

        # 5. Bancos e Instituciones Financieras
        bancos_data = [
            (1, "BAC", "BAC Credomatic", True, True),
            (2, "LAFISE", "Banco LAFISE Bancentro", True, True),
            (3, "BANPRO", "Banpro Grupo Promerica", True, True),
            (4, "BDF", "Banco BDF", True, True),
            (5, "FICOHSA", "Banco Ficohsa Nicaragua", True, True),
            (6, "BILLETERA_MOVIL", "Billeteras Móviles (Kash / BIMO / Banpro Móvil)", False, True),
        ]
        for id_bco, codigo, nombre, req_titular, activo in bancos_data:
            CatBanco.objects.update_or_create(
                id=id_bco,
                defaults={"codigo": codigo, "nombre": nombre, "requiere_titular": req_titular, "activo": activo}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(bancos_data)} bancos."))

        # 6. Estados de Préstamos
        estados_prestamo_data = [
            (1, "SOLICITADO", "Solicitado", True, False, 1, "Crédito registrado pendiente de validación"),
            (2, "APROBADO", "Aprobado", True, False, 2, "Crédito validado listo para desembolso"),
            (3, "VIGENTE", "Vigente / Al Día", True, False, 3, "Desembolsado al corriente sin atrasos"),
            (4, "EN_GRACIA", "En Gracia", True, False, 4, "Atraso dentro de días de tolerancia"),
            (5, "EN_MORA", "En Mora Legal", True, True, 5, "Superó tolerancia; devenga mora diaria"),
            (6, "REESTRUCTURADO", "Reestructurado", True, False, 6, "Refinanciado por mutuo acuerdo"),
            (7, "CANCELADO", "Cancelado", False, False, 7, "Saldado en su totalidad"),
            (8, "CASTIGADO", "Castigado / Pérdida", False, True, 8, "Cartera incobrable liquidada"),
        ]
        for id_ep, codigo, nombre, es_activo, es_mora, orden, desc in estados_prestamo_data:
            CatEstadoPrestamo.objects.update_or_create(
                id=id_ep,
                defaults={
                    "codigo": codigo,
                    "nombre": nombre,
                    "es_activo": es_activo,
                    "es_mora": es_mora,
                    "orden_flujo": orden,
                    "descripcion": desc
                }
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(estados_prestamo_data)} estados de préstamo."))

        # 7. Estados de Cuotas
        estados_cuota_data = [
            (1, "PROGRAMADA", "Programada", True, "Cuota proyectada a futuro"),
            (2, "AL_DIA", "Al Día", True, "Cuota exigible en fecha corriente"),
            (3, "EN_GRACIA", "En Gracia", True, "Vencida dentro del margen de gracia"),
            (4, "VENCIDA", "Vencida", True, "Vencida fuera de gracia con mora"),
            (5, "PAGADA_TOTAL", "Pagada Total", False, "Satisfecha al 100%"),
            (6, "PAGADA_PARCIAL", "Pagada Parcial", True, "Abonada con saldo restante exigible"),
            (7, "CONDONADA", "Condonada", False, "Exonerada por acuerdo administrativo"),
        ]
        for id_ec, codigo, nombre, req_cobro, desc in estados_cuota_data:
            CatEstadoCuota.objects.update_or_create(
                id=id_ec,
                defaults={"codigo": codigo, "nombre": nombre, "requiere_cobro": req_cobro, "descripcion": desc}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(estados_cuota_data)} estados de cuota."))

        # 8. Estados de Clientes
        estados_cliente_data = [
            (1, "PROSPECTO", "Prospecto", True, "Cliente nuevo sin historial previo"),
            (2, "ACTIVO_SOLVENTE", "Activo / Solvente", True, "Cliente al día apto para colocaciones"),
            (3, "EN_OBSERVACION", "En Observación", True, "Cliente con atrasos recurrentes"),
            (4, "BLOQUEADO_MORA", "Bloqueado por Mora", False, "Inhabilitado para nuevos créditos"),
            (5, "VETADO_LISTA_NEGRA", "Vetado / Lista Negra", False, "Incumplimiento legal grave"),
        ]
        for id_ecli, codigo, nombre, permite_cred, desc in estados_cliente_data:
            CatEstadoCliente.objects.update_or_create(
                id=id_ecli,
                defaults={"codigo": codigo, "nombre": nombre, "permite_credito": permite_cred, "descripcion": desc}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(estados_cliente_data)} estados de cliente."))

        # 9. Estados de Caja
        estados_caja_data = [
            (1, "ABIERTA", "Abierta", True),
            (2, "EN_ARQUEO", "En Arqueo", False),
            (3, "CERRADA_CONCILIADA", "Cerrada Conciliada", False),
            (4, "CON_SOBRANTE", "Cerrada con Sobrante", False),
            (5, "CON_FALTANTE", "Cerrada con Faltante", False),
        ]
        for id_ecaj, codigo, nombre, permite_mov in estados_caja_data:
            CatEstadoCaja.objects.update_or_create(
                id=id_ecaj,
                defaults={"codigo": codigo, "nombre": nombre, "permite_movimientos": permite_mov}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(estados_caja_data)} estados de caja."))

        # 10. Tipos de Actividad de Auditoría (Ley 977 / UAF)
        actividades_audit_data = [
            (1, "CLI_CREAR", "Clientes", "Registro de nuevo prestatario", "Informativo"),
            (2, "CLI_EDITAR", "Clientes", "Modificación de expediente de cliente", "Informativo"),
            (3, "CLI_BLOQUEAR", "Clientes", "Bloqueo o veto de cliente", "Alto"),
            (4, "FND_INYECCION", "Fondos", "Inyección de capital a fondo", "Alto"),
            (5, "FND_RETIRO", "Fondos", "Retiro de capital de fondo", "Crítico"),
            (6, "LON_SOLICITAR", "Préstamos", "Registro de solicitud de crédito", "Informativo"),
            (7, "LON_APROBAR", "Préstamos", "Aprobación de crédito", "Alto"),
            (8, "LON_DESEMBOLSAR", "Préstamos", "Desembolso de préstamo", "Crítico"),
            (9, "PAG_ASENTAR", "Pagos", "Asentamiento de cobro / abono", "Alto"),
            (10, "PAG_ANULAR", "Pagos", "Anulación de recibo de cobro", "Crítico"),
            (11, "CAJ_APERTURA", "Caja", "Apertura de sesión de caja", "Informativo"),
            (12, "CAJ_CIERRE", "Caja", "Cierre y conciliación física de caja", "Alto"),
            (13, "DOC_PAGARE", "Legal", "Generación de pagaré legal PDF/A", "Informativo"),
            (14, "CFG_POLITICAS", "Configuración", "Modificación de tasas y políticas", "Crítico"),
        ]
        for id_ta, codigo, modulo, nombre, severidad in actividades_audit_data:
            CatTipoActividad.objects.update_or_create(
                id=id_ta,
                defaults={"codigo": codigo, "modulo": modulo, "nombre": nombre, "nivel_severidad": severidad}
            )
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(actividades_audit_data)} tipos de auditoría."))

        # 11. Catálogo de Permisos y Matriz de Roles
        permisos_data = [
            # Dashboard
            (1, "DASHBOARD", "DASH_VER", "Ver Dashboard Operativo", "Acceso a indicadores y metas"),
            # Clientes
            (2, "CLIENTES", "CLI_VER", "Consultar Expedientes de Clientes", "Ver lista y detalle de clientes"),
            (3, "CLIENTES", "CLI_CREAR", "Registrar Nuevo Cliente", "Apertura de ficha de cliente"),
            (4, "CLIENTES", "CLI_EDITAR", "Modificar Datos de Cliente", "Actualizar dirección y teléfono"),
            (5, "CLIENTES", "CLI_ELIMINAR", "Eliminar / Desactivar Cliente", "Baja de cliente"),
            # Préstamos
            (6, "PRESTAMOS", "LON_VER", "Ver Cartera de Préstamos", "Consultar lista y detalle de préstamos"),
            (7, "PRESTAMOS", "LON_CREAR", "Originación de Crédito", "Wizard de crédito y multifondo"),
            (8, "PRESTAMOS", "LON_PAGARE", "Descargar Pagaré y Contrato", "Emisión de documentos oficiales"),
            # Cobranza
            (9, "COBROS", "COB_VER", "Ver Agenda de Cobros", "Consultar cuotas del día y atrasadas"),
            (10, "COBROS", "COB_REGISTRAR", "Asentar Cobros / Abonos", "Registrar pagos y emitir comprobante"),
            # Caja y Arqueo
            (11, "ARQUEO", "CAJ_VER", "Ver Arqueo de Caja", "Ver balance diario de cobros"),
            (12, "ARQUEO", "CAJ_OPERAR", "Apertura y Cierre de Caja", "Gestión de turno de caja física"),
            # Fondos Familiares
            (13, "FONDOS", "FND_VER", "Ver Bolsas de Fondos", "Consultar saldos y rentabilidad"),
            (14, "FONDOS", "FND_OPERAR", "Inyecciones y Retiros", "Modificar capital disponible"),
            # Informes
            (15, "INFORMES", "INF_VER", "Consultar Informe Financiero", "Ver balances contables y bolsas"),
            (16, "INFORMES", "INF_EXPORTAR", "Exportar Informes Contables", "Descarga de reportes ejecutivos"),
            # Configuración y Permisos
            (17, "CONFIGURACION", "CFG_VER", "Ver Políticas de Negocio", "Consultar tasas y días de gracia"),
            (18, "CONFIGURACION", "CFG_EDITAR", "Modificar Políticas", "Ajustar parámetros globales"),
            (19, "USUARIOS", "USR_GESTIONAR", "Gestión de Usuarios", "Crear y editar usuarios"),
            (20, "PERMISOS", "PERM_GESTIONAR", "Administrar Permisos RBAC", "Asignar permisos a roles"),
        ]
        perm_objs = []
        for id_p, modulo, codigo, nombre, desc in permisos_data:
            p_obj, _ = CatPermiso.objects.update_or_create(
                id=id_p,
                defaults={"modulo": modulo, "codigo": codigo, "nombre": nombre, "descripcion": desc}
            )
            perm_objs.append(p_obj)
        self.stdout.write(self.style.SUCCESS(f"Sembrados {len(perm_objs)} permisos de catálogo."))

        # Mapeo inicial de permisos por rol:
        # ADMINISTRADOR: Todos activos
        for p in perm_objs:
            RolPermiso.objects.update_or_create(
                rol=RolUsuario.ADMINISTRADOR,
                permiso=p,
                defaults={"activo": True}
            )

        # COBRANZA: Operativa básica diaria
        permisos_cobranza = {
            "DASH_VER",
            "CLI_VER",
            "CLI_CREAR",
            "CLI_EDITAR",
            "LON_VER",
            "LON_PAGARE",
            "COB_VER",
            "COB_REGISTRAR",
            "CAJ_VER",
            "CAJ_OPERAR",
        }
        for p in perm_objs:
            RolPermiso.objects.update_or_create(
                rol=RolUsuario.COBRANZA,
                permiso=p,
                defaults={"activo": p.codigo in permisos_cobranza}
            )
        self.stdout.write(self.style.SUCCESS("Matriz de permisos por rol sincronizada (ADMINISTRADOR y COBRANZA)."))

        self.stdout.write(self.style.SUCCESS("Migración y siembra de catálogos completada exitosamente!"))
