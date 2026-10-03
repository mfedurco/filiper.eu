plugins {
    java
}

group = "sk.vyprava"
version = "1.0.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/") {
        name = "papermc"
    }
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:26.2.build.124-stable")
    compileOnly("com.google.code.gson:gson:2.14.0")
    implementation("org.postgresql:postgresql:42.7.13")
    implementation("com.zaxxer:HikariCP:7.1.0")
    implementation("org.slf4j:slf4j-jdk14:2.0.17")
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testRuntimeOnly("com.google.code.gson:gson:2.14.0")
}

tasks.test {
    useJUnitPlatform()
}

sourceSets {
    create("smoke") {
        java.srcDir("src/smoke/java")
        compileClasspath += sourceSets.main.get().output
        runtimeClasspath += sourceSets.main.get().output
    }
}

configurations.named("smokeImplementation") {
    extendsFrom(configurations.implementation.get())
}

tasks.processResources {
    val props = mapOf("version" to version)
    inputs.properties(props)
    filesMatching("plugin.yml") {
        expand(props)
    }
}

tasks.jar {
    archiveFileName.set("filiper.eu-vyprava.jar")
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    from({
        configurations.runtimeClasspath.get()
            .filter { it.isFile && it.name.endsWith(".jar") }
            .map { zipTree(it) }
    })
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/*.EC")
}

tasks.register<JavaExec>("neonSmoke") {
    group = "verification"
    description = "JDBC smoke test. Reads DATABASE_URL_UNPOOLED from the environment or .env.local."
    classpath = sourceSets.getByName("smoke").runtimeClasspath
    mainClass.set("sk.vyprava.smoke.NeonSmoke")
    workingDir = layout.projectDirectory.asFile
    dependsOn("smokeClasses")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.release.set(25)
}
