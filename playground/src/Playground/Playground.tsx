import {
    Box,
    Button,
    ButtonGroup,
    ButtonProps,
    Center,
    Code,
    Drawer,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerHeader,
    DrawerOverlay,
    Flex,
    Kbd,
    Menu,
    MenuButton,
    MenuDivider,
    MenuGroup,
    MenuItem,
    MenuItemOption,
    MenuList,
    MenuOptionGroup,
    ModalFooter,
    Popover,
    PopoverBody,
    PopoverContent,
    PopoverTrigger,
    Tab,
    TabList,
    TabProps,
    Tabs,
    useClipboard,
    useColorMode,
    useModalContext,
} from "@chakra-ui/react";
import Editor, { EditorProps } from "@monaco-editor/react";
import { BaseField, Field, FieldProps, FormDialog, FormLayout, useFormContext, useWatch } from "@saas-ui/react";
import { useActor, useSelector } from "@xstate/react";
import type { TemplateContextOptions } from "openapi-zod-client";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { match } from "ts-pattern";
import { defaultOptionValues, OptionsForm, OptionsFormValues } from "../components/OptionsForm";
import type { GetLanguageSchemasData } from "../macros/get-language-schemas";
import { isValidDocumentName, isValidPrettierConfig, isValidTemplateName } from "./Playground.asserts";
import { presetTemplateList } from "./Playground.consts";
import { FileTabData, usePlaygroundContext } from "./Playground.machine";
import { presets } from "./presets";

// TODO
// template context explorer -> copy ctx as JSON to clipboard + open https://jsoncrack.com/editor
// TODO diff editor + collect warnings
// https://reactflow.dev/ + dependency graph

// when hovering on output, show source schema in input ?
// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-hover-provider-example

export const Playground = () => {
    const service = usePlaygroundContext();
    const [state, send] = useActor(service);

    const activeInputTab = state.context.activeInputTab;
    const activeInputIndex = state.context.activeInputIndex;

    const inputList = state.context.inputList;

    const activeOutputTab = state.context.activeOutputTab;
    const outputList = state.context.outputList;

    const { colorMode } = useColorMode();

    return (
        <Flex h="100%" pos="relative">
            <Box display="flex" boxSize="100%">
                <PanelGroup direction="horizontal">
                    <Panel defaultSize={50} minSize={20}>
                        <Tabs variant="line" size="sm" index={activeInputIndex}>
                            <TabList
                                minH="42px"
                                className="scrollbar"
                                overflowX="scroll"
                                overflowY="hidden"
                                scrollSnapType="x"
                                scrollSnapAlign="start"
                                cursor="pointer"
                                onDoubleClick={(e) => {
                                    if (e.target === e.currentTarget) {
                                        send({ type: "Add file" });
                                    }
                                }}
                            >
                                {inputList.map((fileTab) => {
                                    const indicator = match(fileTab.name)
                                        .with(state.context.selectedOpenApiFileName, () => "[o]")
                                        .with(state.context.selectedTemplateName, () => "[t]")
                                        .with(state.context.selectedPrettierConfig, () => "[p]")
                                        .otherwise(() => "");

                                    return (
                                        <FileTab
                                            key={fileTab.name}
                                            onClick={() => send({ type: "Select input tab", tab: fileTab })}
                                            data-tab-name={fileTab.name}
                                        >
                                            {indicator ? <Box mr="1">{indicator}</Box> : null}
                                            <Box>{fileTab.name}</Box>
                                            <FileTabActions fileTab={fileTab} />
                                        </FileTab>
                                    );
                                })}
                                <FileTab onClick={() => send({ type: "Add file" })}>
                                    <Box display="flex" alignItems="center">
                                        <Box className="i-material-symbols-add" boxSize="1.25em" mt="1" />
                                        Add
                                    </Box>
                                </FileTab>
                            </TabList>
                        </Tabs>
                        <Editor
                            path={activeInputTab}
                            value={inputList.at(activeInputIndex)?.content}
                            onChange={(content) => send({ type: "Update input", value: content ?? "" })}
                            onMount={(editor, monaco) => {
                                send({ type: "Editor Loaded", editor, name: "input" });
                                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                                    send({ type: "Save" });
                                });
                            }}
                            theme={colorMode === "dark" ? "vs-dark" : "vs-light"}
                            beforeMount={(monaco) => {
                                const schemas: GetLanguageSchemasData = import.meta.compileTime(
                                    "../macros/get-language-schemas.ts"
                                );

                                const prettierUri = new monaco.Uri().with({ path: inputList[2].name });

                                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                                    validate: true,
                                    schemas: [
                                        {
                                            uri: schemas.prettier.id,
                                            fileMatch: [prettierUri.toString()],
                                            schema: schemas.prettier,
                                        },
                                    ],
                                });
                            }}
                        />
                    </Panel>
                    <PanelResizeHandle>
                        <Center mx={2} h={"100%"}>
                            <Box
                                aria-label="Panel Resize"
                                className="i-material-symbols-drag-indicator"
                                boxSize="1em"
                            />
                        </Center>
                    </PanelResizeHandle>
                    <Panel defaultSize={50} minSize={20}>
                        <Tabs
                            variant="line"
                            size="sm"
                            index={state.context.activeOutputIndex}
                            display="flex"
                            alignItems="center"
                        >
                            <TabList
                                minH="42px"
                                className="scrollbar"
                                overflowX="scroll"
                                overflowY="hidden"
                                scrollSnapType="x"
                                scrollSnapAlign="start"
                                flexGrow={1}
                            >
                                {outputList.map((fileTab) => (
                                    <FileTab
                                        key={fileTab.name}
                                        onClick={() => send({ type: "Select output tab", tab: fileTab })}
                                        data-tab-name={fileTab.name}
                                    >
                                        {fileTab.name}
                                    </FileTab>
                                ))}
                            </TabList>
                            <Box ml="auto">
                                <PlaygroundActions flexShrink={0} ml="2" mb="2" mr="4" />
                            </Box>
                        </Tabs>
                        <Editor
                            path={activeOutputTab}
                            value={outputList.at(state.context.activeOutputIndex)?.content}
                            theme={colorMode === "dark" ? "vs-dark" : "vs-light"}
                            beforeMount={(monaco) => {
                                const declarations: Array<{ name: string; code: string }> = import.meta.compileTime(
                                    "../macros/get-ts-declarations.ts"
                                );

                                declarations.forEach(({ name, code }) => {
                                    monaco.languages.typescript.typescriptDefaults.addExtraLib(code, name);
                                });
                            }}
                            onMount={(editor, monaco) =>
                                send({ type: "Editor Loaded", editor, name: "output", monaco })
                            }
                        />
                    </Panel>
                </PanelGroup>
            </Box>
            <FileTabForm />
            <OptionsDrawer />
        </Flex>
    );
};

const FileTab = (props: TabProps) => {
    return (
        <Tab
            display="flex"
            alignItems="center"
            borderWidth="1px"
            borderColor="bgHover"
            backgroundColor="bg"
            _selected={{ bg: "bgHover", fontWeight: "bold" }}
            data-group
            {...props}
        />
    );
};

const FileTabActions = ({ fileTab }: { fileTab: FileTabData }) => {
    const file = fileTab;
    const service = usePlaygroundContext();
    const send = service.send;

    return (
        <ButtonGroup alignItems="center" ml="2" hidden={Boolean(file.preset)}>
            <Button
                as="div"
                colorScheme="blue"
                aria-label="Edit"
                className="i-material-symbols-edit-square-outline"
                boxSize="1.25em"
                padding="0"
                borderRadius="0"
                minWidth="0"
                onClick={(e) => {
                    e.stopPropagation();
                    if (file.preset) return;
                    send({ type: "Edit file", tab: file });
                }}
                visibility="hidden"
                _groupHover={{ visibility: "visible" }}
                isDisabled={Boolean(file.preset)}
            />
            <Button
                as="div"
                colorScheme="red"
                aria-label="Close"
                className="i-material-symbols-close"
                boxSize="1.25em"
                padding="0"
                borderRadius="0"
                minWidth="0"
                mt="1"
                onClick={(e) => {
                    e.stopPropagation();
                    send({ type: "Remove file", tab: file });
                }}
                visibility="hidden"
                _groupHover={{ visibility: "visible" }}
            />
        </ButtonGroup>
    );
};

const PlaygroundActions = (props: ButtonProps) => {
    const service = usePlaygroundContext();
    const send = service.send;

    return (
        <Menu>
            <MenuButton
                as={Button}
                {...props}
                size="sm"
                variant="outline"
                rightIcon={<Box className="i-mdi-chevron-down" boxSize="1.25em" />}
            >
                Actions
            </MenuButton>
            <MenuList>
                <MenuItem onClick={() => send({ type: "Save" })}>
                    <span>Save</span>
                    <Box ml="auto">
                        <Kbd fontSize="xs">cmd</Kbd> + <Kbd fontSize="xs">s</Kbd>
                    </Box>
                </MenuItem>
                <MenuItem onClick={() => send({ type: "Reset" })}>Reset</MenuItem>
                <MenuItem onClick={() => send({ type: "Add file" })}>Add input file</MenuItem>
                <GoToFileMenu />
                <SelectPresetTemplateMenu />
                {/* TODO */}
                {/* <MenuItem>Use OpenAPI samples</MenuItem> */}
                <MenuItem onClick={() => send({ type: "Open options" })}>Edit lib options</MenuItem>
                <MenuItem as="a" href="https://apis.guru/" target="_blank" rel="external">
                    Browse APIs.guru
                </MenuItem>
            </MenuList>
        </Menu>
    );
};

const SelectPresetTemplateMenu = () => {
    const service = usePlaygroundContext();
    const send = service.send;

    const selectedPresetTemplate = useSelector(service, (state) => state.context.selectedPresetTemplate);
    const selectedPreset = presetTemplateList.find((t) => t.preset === selectedPresetTemplate)!;
    const defaultValue = selectedPreset?.preset ?? "";

    return (
        <Popover trigger="hover" placement="left" closeOnBlur={false}>
            <PopoverTrigger>
                <MenuItem>Select template preset</MenuItem>
            </PopoverTrigger>
            <PopoverContent>
                <PopoverBody>
                    <MenuOptionGroup
                        defaultValue={defaultValue}
                        title="Template presets"
                        type="radio"
                        onChange={(value) =>
                            send({
                                type: "Select preset template",
                                presetTemplate: presetTemplateList.find(
                                    (preset) => preset.preset === (value as string)
                                )!,
                            })
                        }
                    >
                        {presetTemplateList.map((preset) => (
                            <MenuItemOption
                                key={preset.preset}
                                value={preset.preset}
                                isDisabled={preset.preset === defaultValue}
                                _hover={{ bg: "bgHover" }}
                            >
                                {preset.name}
                            </MenuItemOption>
                        ))}
                    </MenuOptionGroup>
                </PopoverBody>
            </PopoverContent>
        </Popover>
    );
};

const GoToFileMenu = () => {
    const service = usePlaygroundContext();
    const [state, send] = useActor(service);

    const inputList = state.context.inputList;
    const outputList = state.context.outputList;

    return (
        <Popover trigger="hover" placement="left" closeOnBlur={false}>
            <PopoverTrigger>
                <MenuItem>Go to file</MenuItem>
            </PopoverTrigger>
            <PopoverContent>
                <PopoverBody>
                    <MenuGroup title="Input">
                        <Box display="flex" flexDirection="column" maxHeight="300px" overflow="auto">
                            {inputList.map((fileTab) => (
                                <MenuItem
                                    key={fileTab.name}
                                    onClick={() => {
                                        send({ type: "Select input tab", tab: fileTab });
                                        document.querySelector(`[data-tab-name="${fileTab.name}"]`)?.scrollIntoView();
                                    }}
                                    _hover={{ bg: "bgHover" }}
                                >
                                    {fileTab.name}
                                </MenuItem>
                            ))}
                        </Box>
                    </MenuGroup>
                    <MenuDivider />
                    <MenuGroup title="Output">
                        <Box display="flex" flexDirection="column" maxHeight="300px" overflow="auto">
                            {outputList.map((fileTab) => (
                                <MenuItem
                                    key={fileTab.name}
                                    onClick={() => {
                                        send({ type: "Select output tab", tab: fileTab });
                                        document.querySelector(`[data-tab-name="${fileTab.name}"]`)?.scrollIntoView();
                                    }}
                                    _hover={{ bg: "bgHover" }}
                                >
                                    {fileTab.name}
                                </MenuItem>
                            ))}
                        </Box>
                    </MenuGroup>
                </PopoverBody>
            </PopoverContent>
        </Popover>
    );
};

const FileTabForm = () => {
    const service = usePlaygroundContext();
    const [state, send] = useActor(service);
    const formModalDefaultValues = state.context.fileForm;

    return (
        <FormDialog
            size="2xl"
            title={state.matches("ready.Creating file tab") ? "Add input file" : "Edit input file"}
            defaultValues={formModalDefaultValues}
            mode="onSubmit"
            isOpen={state.hasTag("file")}
            onClose={() => send({ type: "Close modal" })}
            onSubmit={(fileTab) => send({ type: "Submit file modal", tab: fileTab })}
            footer={<CreateFileFormFooter />}
        >
            <FormLayout>
                <FileFormFileName />
                <FileFormFieldEditor />
            </FormLayout>
        </FormDialog>
    );
};

const defaultFileNameHelper =
    "The extension will be used to determine if it's an OpenAPI document `{.yaml,.yml,.json}`, an handlebars template `.hbs` or a prettier config `.prettierrc.json`";
const getFileNameInferredRole = (fileName: string) => {
    return match(fileName)
        .when(
            () => isValidPrettierConfig(fileName),
            () => "prettier" as const
        )
        .when(
            () => isValidTemplateName(fileName),
            () => "template" as const
        )
        .when(
            () => isValidDocumentName(fileName),
            () => "openapi document" as const
        )
        .otherwise(() => "unknown" as const);
};

const FileFormFileName = () => {
    const service = usePlaygroundContext();
    const [state] = useActor(service);

    const formModalDefaultValues = state.context.fileForm;
    const inputList = state.context.inputList;

    const form = useFormContext();
    const fileName = useWatch({ name: "name", control: form.control });

    const language = getFileNameExtension(fileName);
    const inferredRole = getFileNameInferredRole(fileName);

    return (
        <Field
            name="name"
            label="File name*"
            type="text"
            help={language ? `Inferred as ${inferredRole}` : defaultFileNameHelper}
            rules={{
                required: "File name is required",
                validate: {
                    unique: (value: string) =>
                        inputList.some((file) => file.name === value && formModalDefaultValues.index !== file.index)
                            ? "File name should be unique"
                            : true,
                },
            }}
            autoFocus
        />
    );
};

const getFileNameExtension = (fileName: string) => (fileName.includes(".") ? fileName.split(".").pop() : "");
const FileFormFieldEditor = () => {
    const form = useFormContext();

    const fileName = useWatch({ name: "name", control: form.control });
    const language = getFileNameExtension(fileName);

    return <FieldEditor name="content" label="Content" language={language} />;
};

const FieldEditor = ({ name, language, ...props }: FieldProps & Pick<EditorProps, "language">) => {
    const form = useFormContext();
    const { colorMode } = useColorMode();

    return (
        <BaseField name={name} {...props}>
            <Editor
                defaultValue={form.getValues(name)}
                onChange={(content) => form.setValue(name, content)}
                onMount={() => form.register(name)}
                theme={colorMode === "dark" ? "vs-dark" : "vs-light"}
                height="300px"
                language={language}
            />
        </BaseField>
    );
};

const OptionsDrawer = () => {
    const service = usePlaygroundContext();
    const [state, send] = useActor(service);

    const activeOutputTab = state.context.activeOutputTab;

    const relevantOptions = getRelevantOptions(state.context.previewOptions);
    const cliCode = createPnpmCommand(activeOutputTab, relevantOptions);

    return (
        <Drawer
            isOpen={state.matches("ready.Editing options")}
            onClose={() => send({ type: "Close options" })}
            size="lg"
            placement="left"
        >
            <DrawerOverlay />
            <DrawerContent>
                <DrawerCloseButton />
                <DrawerHeader>
                    <Flex justifyContent="space-between" alignItems="center" mr="8">
                        <Code>TemplateContext["options"]</Code>
                        <ButtonGroup>
                            <Button variant="outline" onClick={() => send({ type: "Reset preview options" })}>
                                Reset
                            </Button>
                            <Button type="submit" form="options-form">
                                Save options
                            </Button>
                        </ButtonGroup>
                    </Flex>
                </DrawerHeader>

                <DrawerBody>
                    <PanelGroup direction="vertical">
                        <Panel defaultSize={60} minSize={20}>
                            <OptionsForm
                                key={state.context.optionsFormKey}
                                id="options-form"
                                mb="4"
                                onChange={(update) =>
                                    send({ type: "Update preview options", options: update as OptionsFormValues })
                                }
                                onSubmit={(values) => {
                                    const booleanOptions = getRelevantOptions(values);
                                    send({ type: "Save options", options: { ...values, ...booleanOptions } });
                                }}
                                defaultValues={state.context.previewOptions}
                            />
                        </Panel>
                        <PanelResizeHandle>
                            <Center mb={6}>
                                <Box
                                    aria-label="Panel Resize"
                                    className="i-material-symbols-drag-handle"
                                    boxSize="1em"
                                />
                            </Center>
                        </PanelResizeHandle>
                        <Panel defaultSize={40} minSize={20}>
                            <Box display="flex" alignItems="center">
                                <Code lang="sh" rounded="md" px="2" py="1" mr="4" fontSize="xs">
                                    {cliCode}
                                </Code>
                                <CopyButton width="80px" ml="auto" code={cliCode} />
                            </Box>
                            <Box as="pre" padding="5" rounded="8px" my="4" bg="bgHover" color="text">
                                {JSON.stringify(relevantOptions, null, 2)}
                            </Box>
                        </Panel>
                    </PanelGroup>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    );
};

const CopyButton = ({ code, ...props }: ButtonProps & { code: string }) => {
    const { hasCopied, onCopy } = useClipboard(code);

    return (
        <Button
            size="sm"
            textTransform="uppercase"
            colorScheme="teal"
            fontSize="xs"
            height="24px"
            {...props}
            onClick={onCopy}
        >
            {hasCopied ? "Copied!" : "Copy"}
        </Button>
    );
};

type CliOptions = Exclude<keyof OptionsFormValues, "useMainResponseDescriptionAsEndpointDefinitionFallback">;
const optionNameToCliOptionName = {
    noWithAlias: "--no-with-alias",
    baseUrl: "--base-url",
    apiClientName: "--api-client-name",
    apiClientConstructorName: "--api-client-constructor-name",
    isErrorStatus: "--error-expr",
    isMainResponseStatus: "--success-expr",
    shouldExportAllSchemas: "--export-schemas",
    shouldExportAllTypes: "--export-types",
    isMediaTypeAllowed: "--media-type-expr",
    withImplicitRequiredProps: "--implicit-required",
    withDeprecatedEndpoints: "--with-deprecated",
    groupStrategy: "--group-strategy",
    complexityThreshold: "--complexity-threshold",
    defaultStatusBehavior: "--default-status",
} as const satisfies Record<CliOptions, string>;

const createPnpmCommand = (outputPath: string, relevantOptions: TemplateContextOptions) => {
    return `pnpx openapi-zod-client ./petstore.yaml -o ./${outputPath}
    ${Object.entries(relevantOptions).reduce(
        (acc, [optionName, value]) =>
            `${acc} ${optionNameToCliOptionName[optionName as keyof typeof optionNameToCliOptionName]}="${
                value.toString()
            }"`,
        ""
    )}
    `;
};

function getRelevantOptions(options: Partial<TemplateContextOptions> & { booleans?: string[] }) {
    return Object.fromEntries(
        Object.entries({
            ...options,
            ...Object.fromEntries((options.booleans ?? []).map((boolOption) => [boolOption, true])),
        }).filter(
            ([name, value]) =>
                Boolean(value) &&
                name !== "booleans" &&
                value !== defaultOptionValues[name as keyof typeof defaultOptionValues]
        )
    );
}

const CreateFileFormFooter = () => {
    const form = useFormContext();
    const modal = useModalContext();
    return (
        <ModalFooter>
            <ButtonGroup>
                <Button variant="ghost" mr={3} onClick={modal.onClose}>
                    Cancel
                </Button>
                <Button variant="outline" onClick={() => form.setValue("content", presets.defaultInput)}>
                    Use petstore
                </Button>
                <Button type="submit">Save file</Button>
            </ButtonGroup>
        </ModalFooter>
    );
};
